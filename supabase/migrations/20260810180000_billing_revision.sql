-- ============================================================================
-- BILLING — REWIZJA CENNIKA: SCHEMAT
--
-- Zmiany schematu pod rewizję z 10.08.2026. Bez danych cennika — ceny, nazwy
-- i macierz idą przez panel, zgodnie z ustaleniem. Wyjątkiem są limity AI
-- przepisywane na progi miękkie (sześć komórek, w których pomyłka oznacza albo
-- twardą blokadę u klienta, albo brak jakiegokolwiek progu).
--
-- ⚠️ URUCHAMIAĆ W DWÓCH KROKACH — patrz CZĘŚĆ A i CZĘŚĆ B.
-- ============================================================================


-- ============================================================================
-- CZĘŚĆ A — wykonać OSOBNO, jako pierwszą, poza transakcją.
--
-- Ten sam powód co przy `platform_admin`: PostgreSQL nie pozwala użyć nowej
-- wartości enuma w tej samej transakcji, w której ją dodano, a część B używa
-- 'read_only' w indeksie częściowym.
-- ============================================================================

ALTER TYPE public.billing_subscription_status ADD VALUE IF NOT EXISTS 'read_only';


-- ============================================================================
-- CZĘŚĆ B
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. LINIE PRODUKTOWE
--
-- Powód: Warsztat i Agent to od tej rewizji dwa niezależne produkty. Agent musi
-- dać się kupić bez żadnego planu Warsztatu, a warsztat ma móc mieć oba naraz.
-- Dotychczasowy indeks „jedna aktywna subskrypcja na podmiot" tego zabraniał —
-- był poprawny, dopóki istniały pakiety łączone.
-- ---------------------------------------------------------------------------
CREATE TYPE public.billing_product_line AS ENUM ('warsztat', 'agent', 'other');

ALTER TABLE public.billing_plans
  ADD COLUMN product_line public.billing_product_line NOT NULL DEFAULT 'other';

UPDATE public.billing_plans SET product_line = 'warsztat' WHERE code LIKE 'warsztat\_%';
UPDATE public.billing_plans SET product_line = 'agent'    WHERE code LIKE 'agent%';
-- Pakiety łączone i trial_max zostają jako 'other' — są wycofywane, a łączenie
-- linii w jednym planie przestaje być modelem, który wspieramy.

-- Linia musi być też na subskrypcji: indeks unikalny nie sięga do innej tabeli.
-- Kolumna jest denormalizacją planu i pilnuje jej trigger niżej, żeby nie dało
-- się jej rozjechać ręcznym zapisem.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN product_line public.billing_product_line NOT NULL DEFAULT 'other';

CREATE OR REPLACE FUNCTION public.billing_sync_subscription_product_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.product_line INTO NEW.product_line
  FROM public.billing_plans p WHERE p.id = NEW.plan_id;

  IF NEW.product_line IS NULL THEN
    RAISE EXCEPTION 'billing: plan % nie istnieje albo nie ma linii produktowej', NEW.plan_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_sync_subscription_product_line() FROM anon, authenticated, PUBLIC;

CREATE TRIGGER trg_billing_subscriptions_product_line
  BEFORE INSERT OR UPDATE OF plan_id ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_sync_subscription_product_line();

-- Jedna aktywna subskrypcja NA LINIĘ PRODUKTOWĄ, nie na podmiot.
-- `read_only` dochodzi do zbioru: klient w trybie odczytu ma odblokować
-- istniejącą subskrypcję wpłatą, a nie zakładać drugą obok.
DROP INDEX IF EXISTS public.billing_subscriptions_one_active;
CREATE UNIQUE INDEX billing_subscriptions_one_active
  ON public.billing_subscriptions (subscriber_type, subscriber_id, product_line)
  WHERE status IN ('trialing', 'active', 'past_due', 'read_only');

-- ---------------------------------------------------------------------------
-- 2. CENA DOCELOWA
--
-- Cennik pokazuje cenę startową i przekreśloną obok docelową od pierwszego dnia —
-- nie ma podwyżki, jest koniec promocji. NULL = brak promocji, cena ostateczna.
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_plans
  ADD COLUMN price_net_target numeric(10,2)
    CHECK (price_net_target IS NULL OR price_net_target >= 0);

ALTER TABLE public.billing_plans
  ADD COLUMN price_gross_target numeric(10,2)
  GENERATED ALWAYS AS (round(price_net_target * (1 + vat_rate / 100), 2)) STORED;

-- ---------------------------------------------------------------------------
-- 3. GWARANCJA CENY
--
-- 12 miesięcy liczone od aktywacji KAŻDEGO klienta osobno, nie od daty kampanii.
-- price_snapshot trzyma kwotę; brakowało daty, do kiedy obowiązuje.
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_subscriptions
  ADD COLUMN price_guarantee_until timestamptz;

-- Data graniczna zapisu na promocję to warunek SPRZEDAŻY, nie właściwość
-- subskrypcji — dlatego w ustawieniach, nie przy planie.
ALTER TABLE public.billing_settings
  ADD COLUMN promo_enrollment_until date;

-- ---------------------------------------------------------------------------
-- 4. FAIR USE ZAMIAST TWARDYCH LIMITÓW AI
--
-- Liczniki pytań AI i wycen AI to nasze jednostki kosztowe, nie jednostki
-- wartości klienta. Zamiast blokady: próg, po którym spowalniamy i alarmujemy
-- po swojej stronie. Progi siedzą w danych, nie w kodzie.
--
-- limit_value = NULL  → nie blokujemy
-- soft_limit_value    → od tej wartości throttling
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_plan_features
  ADD COLUMN soft_limit_value numeric(12,2)
    CHECK (soft_limit_value IS NULL OR soft_limit_value >= 0);

-- Przepisanie istniejących limitów AI na progi miękkie. Plan Free zachowuje
-- limit TWARDY — tam ograniczenie jest częścią lejka, nie karą.
UPDATE public.billing_plan_features pf
SET soft_limit_value = pf.limit_value,
    limit_value      = NULL
FROM public.billing_plans p, public.billing_features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND f.key IN ('ai_repair_help', 'ai_labor_pricing')
  AND p.code IN ('warsztat_standard', 'warsztat_pro')
  AND pf.limit_value IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. DOŁADOWANIA — PULA DOKUPIONA PONAD PLAN
--
-- Świadomie NIE modelujemy tego jako ujemnego zużycia w billing_usage.
-- Tamta tabela odpowiada na pytanie „ile zużyto w okresie" i musi zostać
-- czytelna; wmieszanie w nią zakupów zepsułoby każdy raport i nie miałoby jak
-- wyrazić daty ważności ani kolejności zużycia.
--
-- Pula jest osobna, z własną datą ważności i saldem. Kolejność zużycia:
--   pakiet z planu → doładowania FIFO wg daty ważności → nadwyżka.
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_addon_packs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_type  public.billing_subscriber_type NOT NULL,
  subscriber_id    uuid NOT NULL,
  feature_id       uuid NOT NULL REFERENCES public.billing_features(id) ON DELETE RESTRICT,
  amount_total     numeric(12,2) NOT NULL CHECK (amount_total > 0),
  amount_remaining numeric(12,2) NOT NULL CHECK (amount_remaining >= 0),
  -- NULL = bezterminowo. Minuty Agenta przepadają z końcem okresu, ale SMS-y
  -- i sprawdzenia pojazdu nie — to różnica per rodzaj funkcji, nie globalna.
  expires_at       timestamptz,
  source           text NOT NULL DEFAULT 'purchase'
                   CHECK (source IN ('purchase', 'admin_grant', 'compensation')),
  payment_id       uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_addon_packs_remaining_le_total
    CHECK (amount_remaining <= amount_total)
);

-- Kolejność FIFO: najpierw to, co przepada najwcześniej. Pule bezterminowe na końcu.
CREATE INDEX billing_addon_packs_available
  ON public.billing_addon_packs (subscriber_type, subscriber_id, feature_id, expires_at NULLS LAST)
  WHERE amount_remaining > 0;

CREATE TRIGGER trg_billing_addon_packs_validate_subscriber
  BEFORE INSERT OR UPDATE OF subscriber_type, subscriber_id ON public.billing_addon_packs
  FOR EACH ROW EXECUTE FUNCTION public.billing_validate_subscriber();

CREATE TRIGGER trg_billing_addon_packs_updated_at
  BEFORE UPDATE ON public.billing_addon_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ile dni ważności ma doładowanie tej funkcji. NULL = bezterminowo.
-- Wartość przepisywana na expires_at w chwili zakupu.
ALTER TABLE public.billing_features
  ADD COLUMN pack_validity_days integer
    CHECK (pack_validity_days IS NULL OR pack_validity_days > 0);

ALTER TABLE public.billing_addon_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_addon_packs_select_admin ON public.billing_addon_packs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

REVOKE INSERT, UPDATE, DELETE ON public.billing_addon_packs FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. FUNKCJE UPRAWNIEŃ — ROZSTRZYGANIE PO WIELU SUBSKRYPCJACH
--
-- Dotąd zakładały jedną aktywną subskrypcję (ORDER BY created_at DESC LIMIT 1).
-- Po rozdzieleniu linii produktowych klient ma ich kilka i stara logika
-- odpowiadałaby „nie masz Agenta", gdyby subskrypcja Warsztatu była nowsza —
-- po cichu, bez błędu.
--
-- Zasada: funkcja przysługuje, jeśli daje ją KTÓRAKOLWIEK aktywna subskrypcja;
-- limit to najwyższy z limitów, a brak limitu wygrywa z każdą liczbą.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.billing_active_subscription(public.billing_subscriber_type, uuid);
DROP FUNCTION IF EXISTS public.billing_active_plan(public.billing_subscriber_type, uuid);

CREATE OR REPLACE FUNCTION public.billing_active_subscriptions(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid
)
RETURNS TABLE (subscription_id uuid, plan_id uuid, product_line public.billing_product_line)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.plan_id, s.product_line
  FROM public.billing_subscriptions s
  WHERE s.subscriber_type = p_subscriber_type
    AND s.subscriber_id = p_subscriber_id
    AND s.status IN ('trialing', 'active')
    AND (s.current_period_end IS NULL OR s.current_period_end > now());
$$;

CREATE OR REPLACE FUNCTION public.has_feature(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid,
  p_feature_key     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.billing_active_subscriptions(p_subscriber_type, p_subscriber_id) s
    JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
    JOIN public.billing_features f ON f.id = pf.feature_id
    WHERE f.key = p_feature_key AND f.is_active AND pf.is_enabled
  );
$$;

CREATE OR REPLACE FUNCTION public.feature_limit(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid,
  p_feature_key     text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Brak limitu (NULL) bije każdą liczbę: jeśli którakolwiek subskrypcja daje
  -- funkcję bez ograniczenia, klient jej nie ma.
  SELECT CASE WHEN bool_or(lim IS NULL) THEN NULL ELSE max(lim) END
  FROM (
    SELECT CASE
             WHEN sl.subscription_id IS NOT NULL THEN sl.limit_value
             ELSE pf.limit_value
           END AS lim
    FROM public.billing_active_subscriptions(p_subscriber_type, p_subscriber_id) s
    JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
    JOIN public.billing_features f ON f.id = pf.feature_id
    LEFT JOIN public.billing_subscription_limits sl
           ON sl.subscription_id = s.subscription_id AND sl.feature_id = f.id
    WHERE f.key = p_feature_key AND f.is_active AND pf.is_enabled
  ) t;
$$;

-- check_usage: uprawnienie + limit z planu/umowy + zużycie okresu + pula dokupiona.
--
-- `limit` to nadal limit z planu. Pula z doładowań jest pokazywana osobno
-- (`packs_remaining`) i wliczana do `available`, bo to dwie różne rzeczy:
-- limit mówi, ile przysługuje w abonamencie, pula — ile dokupiono ponad to.
CREATE OR REPLACE FUNCTION public.check_usage(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid,
  p_feature_key     text,
  p_amount          numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
  v_found      boolean := false;
  v_limit      numeric;
  v_soft       numeric;
  v_overridden boolean := false;
  v_used       numeric := 0;
  v_packs      numeric := 0;
  v_available  numeric;
  v_period     date := date_trunc('month', now())::date;
BEGIN
  SELECT id INTO v_feature_id FROM public.billing_features WHERE key = p_feature_key AND is_active;
  IF v_feature_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'unknown_feature',
      'used', 0, 'limit', null, 'remaining', 0, 'packs_remaining', 0
    );
  END IF;

  -- Uprawnienie: czy KTÓRAKOLWIEK aktywna subskrypcja daje tę funkcję.
  SELECT EXISTS (
    SELECT 1
    FROM public.billing_active_subscriptions(p_subscriber_type, p_subscriber_id) s
    JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
    WHERE pf.feature_id = v_feature_id AND pf.is_enabled
  ) INTO v_found;

  -- Limit: najwyższy z limitów, przy czym brak limitu bije każdą liczbę.
  -- Nadpisanie z umowy (billing_subscription_limits) ma pierwszeństwo przed planem.
  SELECT
    CASE WHEN bool_or(lim IS NULL) THEN NULL ELSE max(lim) END,
    max(soft),
    COALESCE(bool_or(is_override), false)
  INTO v_limit, v_soft, v_overridden
  FROM (
    SELECT
      CASE WHEN sl.subscription_id IS NOT NULL THEN sl.limit_value ELSE pf.limit_value END AS lim,
      pf.soft_limit_value AS soft,
      sl.subscription_id IS NOT NULL AS is_override
    FROM public.billing_active_subscriptions(p_subscriber_type, p_subscriber_id) s
    JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
    LEFT JOIN public.billing_subscription_limits sl
           ON sl.subscription_id = s.subscription_id AND sl.feature_id = v_feature_id
    WHERE pf.feature_id = v_feature_id AND pf.is_enabled
  ) t;

  IF NOT v_found THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'feature_not_in_plan',
      'used', 0, 'limit', null, 'remaining', 0, 'packs_remaining', 0
    );
  END IF;

  SELECT COALESCE(u.used, 0) INTO v_used
  FROM public.billing_usage u
  WHERE u.subscriber_type = p_subscriber_type
    AND u.subscriber_id = p_subscriber_id
    AND u.feature_id = v_feature_id
    AND u.period_start = v_period;
  v_used := COALESCE(v_used, 0);

  SELECT COALESCE(sum(amount_remaining), 0) INTO v_packs
  FROM public.billing_addon_packs
  WHERE subscriber_type = p_subscriber_type
    AND subscriber_id = p_subscriber_id
    AND feature_id = v_feature_id
    AND amount_remaining > 0
    AND (expires_at IS NULL OR expires_at > now());

  IF v_limit IS NULL THEN
    -- Bez limitu w planie. `soft_exceeded` służy WYŁĄCZNIE nam — po przekroczeniu
    -- progu spowalniamy i alarmujemy, ale nie blokujemy i nie pokazujemy liczb
    -- klientowi.
    RETURN jsonb_build_object(
      'allowed', true, 'reason', 'unlimited',
      'used', v_used, 'limit', null, 'remaining', null,
      'packs_remaining', v_packs,
      'soft_limit', v_soft,
      'soft_exceeded', (v_soft IS NOT NULL AND v_used > v_soft),
      'overridden', v_overridden
    );
  END IF;

  v_available := GREATEST(v_limit - v_used, 0) + v_packs;

  RETURN jsonb_build_object(
    'allowed',        v_available >= p_amount,
    'reason',         CASE WHEN v_available >= p_amount THEN 'ok' ELSE 'limit_exceeded' END,
    'used',           v_used,
    'limit',          v_limit,
    'remaining',      GREATEST(v_limit - v_used, 0),
    'packs_remaining', v_packs,
    'available',      v_available,
    'soft_limit',     v_soft,
    'soft_exceeded',  (v_soft IS NOT NULL AND v_used > v_soft),
    'overridden',     v_overridden
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.billing_active_subscriptions(public.billing_subscriber_type, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_feature(public.billing_subscriber_type, uuid, text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feature_limit(public.billing_subscriber_type, uuid, text)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_usage(public.billing_subscriber_type, uuid, text, numeric)    TO authenticated, service_role;

COMMIT;

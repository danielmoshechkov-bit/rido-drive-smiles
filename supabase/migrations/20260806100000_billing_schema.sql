-- ============================================================================
-- BILLING — ETAP 1: SCHEMAT
--
-- Tabele, enumy i funkcje uprawnień. Bez danych planów, bez zmian we froncie
-- i w edge functions. Patrz docs/billing/plan.md i docs/billing/admin-panel.md.
--
-- Zasada z admin-panel.md §3, trzymana konsekwentnie: klient CZYTA, nie zapisuje.
-- Żadna tabela billingowa nie ma polityki INSERT/UPDATE/DELETE dla `authenticated`,
-- a granty są odebrane jako druga warstwa. Zapis wyłącznie przez `service_role`
-- (edge functions `billing-admin-*`), tak samo jak w lockdownie z 20260805090000.
--
-- ⚠️ URUCHAMIAĆ W DWÓCH KROKACH — patrz CZĘŚĆ A i CZĘŚĆ B poniżej.
-- ============================================================================


-- ============================================================================
-- CZĘŚĆ A — wykonać OSOBNO, jako pierwszą, poza transakcją.
--
-- PostgreSQL nie pozwala użyć nowej wartości enuma w tej samej transakcji,
-- w której została dodana. Dlatego `platform_admin` musi zostać zatwierdzony,
-- zanim część B zacznie się do niego odwoływać w politykach RLS.
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';


-- ============================================================================
-- CZĘŚĆ B — cała reszta, atomowo.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------- ENUMY

-- Operatorzy płatności. Stripe i PayU mają działać równolegle (admin-panel.md §1),
-- więc to nie jest pole „wybierz jednego", tylko klucz wiersza konfiguracji.
CREATE TYPE public.billing_provider AS ENUM ('stripe', 'payu', 'p24');

-- Podmiot subskrypcji. Platforma sprzedaje kilku różnym typom odbiorców
-- (warsztat, flota, podmiot księgowy), więc subskrypcja nie może być przypięta
-- na sztywno do jednej tabeli. Wartości odpowiadają istniejącym tabelom.
CREATE TYPE public.billing_subscriber_type AS ENUM (
  'service_provider',   -- service_providers  (Warsztat, Agent AI)
  'fleet',              -- fleets
  'entity',             -- entities (księgowość)
  'company',            -- companies (workspace)
  'user'                -- auth.users — plany indywidualne
);

-- Funkcja włączana/wyłączana kontra funkcja z licznikiem (SMS-y, kredyty AI).
CREATE TYPE public.billing_feature_kind AS ENUM ('boolean', 'metered');

CREATE TYPE public.billing_interval AS ENUM ('month', 'year', 'one_time');

CREATE TYPE public.billing_subscription_status AS ENUM (
  'trialing', 'active', 'past_due', 'canceled', 'expired'
);

CREATE TYPE public.billing_event_status AS ENUM (
  'pending', 'processed', 'failed', 'ignored'
);


-- ------------------------------------------------------- billing_gateways
-- Schemat wprost z admin-panel.md §1. Kolumny są wyłącznie jawne — żaden sekret
-- nie ma prawa tu trafić. `secret_status` mówi TYLKO, czy sekret jest ustawiony
-- w Supabase secrets; nigdy nie przechowuje wartości.
CREATE TABLE public.billing_gateways (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider               public.billing_provider NOT NULL UNIQUE,
  is_enabled             boolean NOT NULL DEFAULT false,
  is_sandbox             boolean NOT NULL DEFAULT true,
  merchant_id            text,
  pos_id                 text,
  client_id              text,
  publishable_key        text,
  supports_subscriptions boolean NOT NULL DEFAULT false,
  supports_one_time      boolean NOT NULL DEFAULT true,
  secret_status          text NOT NULL DEFAULT 'missing'
                         CHECK (secret_status IN ('missing', 'set')),
  last_webhook_at        timestamptz,
  last_test_at           timestamptz,
  last_test_result       jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Odpowiednik walidacji z UI („nie da się włączyć bez sekretu"), wymuszony
  -- w bazie, żeby nie dało się tego obejść pominięciem formularza.
  CONSTRAINT billing_gateways_enabled_needs_secret
    CHECK (is_enabled = false OR secret_status = 'set')
);

-- ------------------------------------------------------- billing_features
CREATE TABLE public.billing_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  kind        public.billing_feature_kind NOT NULL DEFAULT 'boolean',
  unit        text,                       -- np. 'SMS', 'kredyt', 'pojazd'
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Funkcja z licznikiem bez jednostki jest nieczytelna w panelu i w limitach.
  CONSTRAINT billing_features_metered_needs_unit
    CHECK (kind <> 'metered' OR unit IS NOT NULL)
);

-- ---------------------------------------------------------- billing_plans
CREATE TABLE public.billing_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  description     text,
  subscriber_type public.billing_subscriber_type NOT NULL,
  price_net       numeric(10,2),          -- NULL wyłącznie dla planów indywidualnych
  vat_rate        numeric(5,2) NOT NULL DEFAULT 23,
  currency        text NOT NULL DEFAULT 'PLN',
  billing_interval public.billing_interval NOT NULL DEFAULT 'month',
  trial_days      integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  is_custom       boolean NOT NULL DEFAULT false,   -- „cena indywidualna"
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,

  -- Zmiana ceny NIE zmienia ceny istniejących subskrypcji (admin-panel.md §3):
  -- nowa cena to nowy price_id u operatora, a stara subskrypcja trzyma swój
  -- snapshot. Dlatego to pole jest tylko wskaźnikiem bieżącego cennika.
  stripe_price_id text,
  payu_plan_id    text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_plans_price_or_custom
    CHECK (is_custom = true OR price_net IS NOT NULL),
  CONSTRAINT billing_plans_price_nonneg
    CHECK (price_net IS NULL OR price_net >= 0)
);

-- Cena brutto liczona, nie wpisywana — żeby nie dało się jej rozjechać z netto.
ALTER TABLE public.billing_plans
  ADD COLUMN price_gross numeric(10,2)
  GENERATED ALWAYS AS (round(price_net * (1 + vat_rate / 100), 2)) STORED;

-- -------------------------------------------------- billing_plan_features
-- Macierz plan × funkcja z limitami (admin-panel.md §2, zakładka Plany).
CREATE TABLE public.billing_plan_features (
  plan_id     uuid NOT NULL REFERENCES public.billing_plans(id) ON DELETE CASCADE,
  feature_id  uuid NOT NULL REFERENCES public.billing_features(id) ON DELETE CASCADE,
  is_enabled  boolean NOT NULL DEFAULT true,
  -- NULL = bez limitu. 0 = funkcja formalnie w planie, ale z zerowym przydziałem.
  limit_value numeric(12,2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_id),
  CONSTRAINT billing_plan_features_limit_nonneg
    CHECK (limit_value IS NULL OR limit_value >= 0)
);

-- --------------------------------------------------- billing_subscriptions
CREATE TABLE public.billing_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_type          public.billing_subscriber_type NOT NULL,
  subscriber_id            uuid NOT NULL,
  plan_id                  uuid NOT NULL REFERENCES public.billing_plans(id),
  status                   public.billing_subscription_status NOT NULL DEFAULT 'trialing',

  current_period_start     timestamptz NOT NULL DEFAULT now(),
  current_period_end       timestamptz,
  trial_ends_at            timestamptz,
  cancel_at                timestamptz,
  canceled_at              timestamptz,

  provider                 public.billing_provider,
  provider_subscription_id text,

  -- Cena zamrożona w chwili założenia subskrypcji. To ona rozstrzyga przy
  -- sporze, a nie bieżący cennik.
  price_snapshot           jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Kod promocyjny użyty przy zakupie. Spięcia rabatów z planami jeszcze nie
  -- budujemy, ale pola muszą być od razu — dodawanie ich później oznaczałoby
  -- migrację tabeli, która ma już ruch produkcyjny.
  -- Obok klucza obcego trzymamy snapshot kodu i procentu: `promo_codes` da się
  -- edytować i kasować, a warunki subskrypcji mają zostać takie, jakie były
  -- w chwili zakupu — tak samo jak price_snapshot.
  promo_code_id            uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  promo_code               text,
  promo_discount_percent   numeric(5,2) CHECK (promo_discount_percent IS NULL
                             OR (promo_discount_percent >= 0 AND promo_discount_percent <= 100)),

  -- Źródło polecenia. Istniejący łańcuch to referral_codes → referral_uses,
  -- więc wiążemy się z konkretnym użyciem (jest tam referrer_user_id potrzebny
  -- do prowizji), plus snapshot samego kodu.
  referral_use_id          uuid REFERENCES public.referral_uses(id) ON DELETE SET NULL,
  referral_code            text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Jeden aktywny abonament na podmiot. Indeks częściowy, więc historia
-- zakończonych subskrypcji zostaje nietknięta.
CREATE UNIQUE INDEX billing_subscriptions_one_active
  ON public.billing_subscriptions (subscriber_type, subscriber_id)
  WHERE status IN ('trialing', 'active', 'past_due');

CREATE INDEX billing_subscriptions_subscriber
  ON public.billing_subscriptions (subscriber_type, subscriber_id);
CREATE INDEX billing_subscriptions_provider_sub
  ON public.billing_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- ---------------------------------------- billing_subscription_limits
-- Nadpisanie limitu na poziomie POJEDYNCZEJ subskrypcji.
--
-- Po co: plan „Sieci" ma cenę i limity ustalane per umowa. Bez tej tabeli
-- każda negocjacja kończyłaby się zakładaniem osobnego planu, a lista planów
-- puchłaby o warianty istniejące dla jednego klienta.
--
-- Zakres celowo wąski: nadpisujemy WYŁĄCZNIE limit. O tym, czy funkcja w ogóle
-- przysługuje, nadal decyduje plan — inaczej uprawnienia rozjechałyby się na
-- dwa źródła prawdy i nie dałoby się odpowiedzieć „co zawiera plan X".
--
-- Uwaga na semantykę NULL: `limit_value = NULL` znaczy „bez limitu", więc
-- o tym, czy nadpisanie obowiązuje, decyduje ISTNIENIE WIERSZA, a nie wartość.
-- Dlatego funkcje niżej używają LEFT JOIN i sprawdzają NULL na kluczu, a nie
-- COALESCE na limicie.
CREATE TABLE public.billing_subscription_limits (
  subscription_id uuid NOT NULL REFERENCES public.billing_subscriptions(id) ON DELETE CASCADE,
  feature_id      uuid NOT NULL REFERENCES public.billing_features(id) ON DELETE CASCADE,
  limit_value     numeric(12,2),
  note            text,                      -- np. numer umowy albo kto zatwierdził
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, feature_id),
  CONSTRAINT billing_subscription_limits_nonneg
    CHECK (limit_value IS NULL OR limit_value >= 0)
);

-- ---------------------------------------------------------- billing_usage
-- Licznik zużycia funkcji metered w okresie rozliczeniowym. Bez tego
-- check_usage() nie ma czego porównywać z limitem.
CREATE TABLE public.billing_usage (
  subscriber_type public.billing_subscriber_type NOT NULL,
  subscriber_id   uuid NOT NULL,
  feature_id      uuid NOT NULL REFERENCES public.billing_features(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  used            numeric(12,2) NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_type, subscriber_id, feature_id, period_start)
);

-- --------------------------------------------------------- billing_events
-- Log zdarzeń od operatorów z możliwością ponowienia (admin-panel.md §2, poz. 9).
-- Bez tego nieprzetworzony webhook znika bez śladu.
CREATE TABLE public.billing_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     public.billing_provider NOT NULL,
  event_type   text NOT NULL,
  external_id  text,                       -- id zdarzenia u operatora
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       public.billing_event_status NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Ochrona przed podwójnym przetworzeniem tego samego zdarzenia operatora.
CREATE UNIQUE INDEX billing_events_provider_external
  ON public.billing_events (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX billing_events_status ON public.billing_events (status, created_at DESC);

-- ------------------------------------------------------- billing_settings
-- Ustawienia globalne (admin-panel.md §2, poz. 10). Jeden wiersz, wymuszony
-- ograniczeniem — konfiguracja platformy nie ma wariantów.
CREATE TABLE public.billing_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_vat_rate      numeric(5,2) NOT NULL DEFAULT 23,
  service_fee_enabled   boolean NOT NULL DEFAULT false,
  service_fee_net       numeric(10,2) NOT NULL DEFAULT 0 CHECK (service_fee_net >= 0),
  grace_period_days     integer NOT NULL DEFAULT 7 CHECK (grace_period_days >= 0),
  default_trial_days    integer NOT NULL DEFAULT 0 CHECK (default_trial_days >= 0),
  auto_invoice_on_paid  boolean NOT NULL DEFAULT false,
  ksef_enabled          boolean NOT NULL DEFAULT false,
  notification_emails   text[] NOT NULL DEFAULT '{}',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.billing_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ------------------------------------------------------ billing_audit_log
-- „Każda zmiana planu/ceny/feature → wpis audytowy" (admin-panel.md §3).
-- Przy sporze o cenę to jedyny dowód, więc tabela jest append-only:
-- brak polityk UPDATE/DELETE dla kogokolwiek poza service_role.
CREATE TABLE public.billing_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,               -- np. 'plan.price_changed'
  target_table text NOT NULL,
  target_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_audit_log_target ON public.billing_audit_log (target_table, target_id, created_at DESC);


-- ------------------------------------------- walidacja podmiotu subskrypcji
-- `subscriber_id` nie ma klucza obcego, bo wskazuje na jedną z pięciu tabel —
-- platforma sprzedaje warsztatom, flotom, wynajmowi i nieruchomościom, więc
-- przypięcie do jednej z nich wymagałoby później przepisania schematu.
--
-- Trigger odtwarza tę część integralności, której FK by pilnował: nie da się
-- zapisać subskrypcji ani zużycia dla podmiotu, którego nie ma.
--
-- UWAGA — czego trigger NIE robi: nie kasuje kaskadowo. Po usunięciu warsztatu
-- czy floty jego subskrypcja i liczniki zostaną w bazie jako sieroty. To ten sam
-- wzorzec, który CLAUDE.md opisuje przy `drivers` („cascade deletes are manual"),
-- więc ścieżki usuwania podmiotów trzeba uzupełnić o te dwie tabele.
CREATE OR REPLACE FUNCTION public.billing_validate_subscriber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  CASE NEW.subscriber_type
    WHEN 'service_provider' THEN
      SELECT EXISTS (SELECT 1 FROM public.service_providers WHERE id = NEW.subscriber_id) INTO v_exists;
    WHEN 'fleet' THEN
      SELECT EXISTS (SELECT 1 FROM public.fleets WHERE id = NEW.subscriber_id) INTO v_exists;
    WHEN 'entity' THEN
      SELECT EXISTS (SELECT 1 FROM public.entities WHERE id = NEW.subscriber_id) INTO v_exists;
    WHEN 'company' THEN
      SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = NEW.subscriber_id) INTO v_exists;
    WHEN 'user' THEN
      SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.subscriber_id) INTO v_exists;
    ELSE
      -- Nowa wartość enuma bez gałęzi tutaj = twarda odmowa, nie ciche przejście.
      RAISE EXCEPTION 'billing: brak walidacji dla subscriber_type = %', NEW.subscriber_type;
  END CASE;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'billing: nie istnieje % o id %', NEW.subscriber_type, NEW.subscriber_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_validate_subscriber() FROM anon, authenticated, PUBLIC;

CREATE TRIGGER trg_billing_subscriptions_validate_subscriber
  BEFORE INSERT OR UPDATE OF subscriber_type, subscriber_id ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_validate_subscriber();

CREATE TRIGGER trg_billing_usage_validate_subscriber
  BEFORE INSERT OR UPDATE OF subscriber_type, subscriber_id ON public.billing_usage
  FOR EACH ROW EXECUTE FUNCTION public.billing_validate_subscriber();


-- --------------------------------------------------------- updated_at
-- Reuse istniejącego helpera (84 użycia w repo), zamiast dokładać własny.
CREATE TRIGGER trg_billing_gateways_updated_at BEFORE UPDATE ON public.billing_gateways
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_features_updated_at BEFORE UPDATE ON public.billing_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_plans_updated_at BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_plan_features_updated_at BEFORE UPDATE ON public.billing_plan_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_subscriptions_updated_at BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_subscription_limits_updated_at BEFORE UPDATE ON public.billing_subscription_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_usage_updated_at BEFORE UPDATE ON public.billing_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_billing_settings_updated_at BEFORE UPDATE ON public.billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================== FUNKCJE UPRAWNIEŃ
--
-- Wszystkie trzy odpowiadają na jedno pytanie: „czy ten podmiot ma dostęp".
-- STABLE i SECURITY DEFINER, bo czytają tabele zamknięte przed klientem.
-- Nie zwracają żadnych danych finansowych — wyłącznie flagi i limity.
-- ============================================================================

-- Aktywna subskrypcja = trialing/active i okres jeszcze nie minął.
-- Zwracamy id subskrypcji, a nie od razu planu, bo limity mogą być nadpisane
-- na poziomie konkretnej umowy (billing_subscription_limits).
CREATE OR REPLACE FUNCTION public.billing_active_subscription(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.billing_subscriptions s
  WHERE s.subscriber_type = p_subscriber_type
    AND s.subscriber_id = p_subscriber_id
    AND s.status IN ('trialing', 'active')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY s.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.billing_active_plan(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan_id
  FROM public.billing_subscriptions s
  WHERE s.id = public.billing_active_subscription(p_subscriber_type, p_subscriber_id);
$$;

-- Czy podmiot ma daną funkcję w swoim planie.
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
  SELECT COALESCE(
    (
      SELECT pf.is_enabled
      FROM public.billing_plan_features pf
      JOIN public.billing_features f ON f.id = pf.feature_id
      WHERE pf.plan_id = public.billing_active_plan(p_subscriber_type, p_subscriber_id)
        AND f.key = p_feature_key
        AND f.is_active
    ),
    false
  );
$$;

-- Obowiązujący limit: nadpisanie z umowy, a w jego braku limit z planu.
--
-- NULL = bez limitu, ale UWAGA: NULL zwracany jest też, gdy funkcji w planie
-- nie ma. Wołający ma najpierw sprawdzić has_feature(), albo użyć check_usage(),
-- które rozróżnia oba przypadki.
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
  SELECT CASE
           -- O nadpisaniu decyduje ISTNIENIE wiersza, nie wartość: NULL w
           -- billing_subscription_limits to świadome „bez limitu".
           WHEN sl.subscription_id IS NOT NULL THEN sl.limit_value
           ELSE pf.limit_value
         END
  FROM public.billing_subscriptions s
  JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
  JOIN public.billing_features f ON f.id = pf.feature_id
  LEFT JOIN public.billing_subscription_limits sl
         ON sl.subscription_id = s.id AND sl.feature_id = f.id
  WHERE s.id = public.billing_active_subscription(p_subscriber_type, p_subscriber_id)
    AND f.key = p_feature_key
    AND f.is_active
    AND pf.is_enabled;
$$;

-- Czy podmiot może zużyć p_amount jednostek funkcji w bieżącym okresie.
-- Zwraca komplet danych do pokazania użytkownikowi, a nie samo true/false —
-- „nie możesz" bez liczby zużytych i limitu jest bezużyteczne w UI.
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
  v_sub_id     uuid;
  v_enabled    boolean;
  v_limit      numeric;
  v_overridden boolean := false;
  v_used       numeric;
  v_period     date := date_trunc('month', now())::date;
BEGIN
  v_sub_id := public.billing_active_subscription(p_subscriber_type, p_subscriber_id);

  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'no_subscription',
      'used', 0, 'limit', null, 'remaining', 0
    );
  END IF;

  -- Uprawnienie bierze się z planu, limit z umowy albo z planu.
  SELECT pf.is_enabled,
         CASE WHEN sl.subscription_id IS NOT NULL THEN sl.limit_value ELSE pf.limit_value END,
         sl.subscription_id IS NOT NULL
    INTO v_enabled, v_limit, v_overridden
  FROM public.billing_subscriptions s
  JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
  JOIN public.billing_features f ON f.id = pf.feature_id
  LEFT JOIN public.billing_subscription_limits sl
         ON sl.subscription_id = s.id AND sl.feature_id = f.id
  WHERE s.id = v_sub_id AND f.key = p_feature_key AND f.is_active;

  IF v_enabled IS NULL OR v_enabled = false THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'feature_not_in_plan',
      'used', 0, 'limit', null, 'remaining', 0
    );
  END IF;

  SELECT COALESCE(u.used, 0) INTO v_used
  FROM public.billing_usage u
  WHERE u.subscriber_type = p_subscriber_type
    AND u.subscriber_id = p_subscriber_id
    AND u.feature_id = (SELECT id FROM public.billing_features WHERE key = p_feature_key)
    AND u.period_start = v_period;

  v_used := COALESCE(v_used, 0);

  -- Brak limitu = bez ograniczeń.
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true, 'reason', 'unlimited',
      'used', v_used, 'limit', null, 'remaining', null,
      'overridden', v_overridden
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',   (v_used + p_amount) <= v_limit,
    'reason',    CASE WHEN (v_used + p_amount) <= v_limit THEN 'ok' ELSE 'limit_exceeded' END,
    'used',      v_used,
    'limit',     v_limit,
    'remaining', GREATEST(v_limit - v_used, 0),
    -- Panel pokazuje, czy limit pochodzi z planu, czy z indywidualnej umowy.
    'overridden', v_overridden
  );
END;
$$;


-- ================================================================== RLS
--
-- Konfiguracja billingu: czyta wyłącznie platform_admin.
-- Subskrypcje i zużycie: dodatkowo widzi je właściciel podmiotu — ale ustalenie
-- właściciela per typ podmiotu należy do etapu 2 (edge functions), więc na razie
-- czyta tylko platform_admin. To celowo za ciasno, nie za luźno.
-- Zapis: NIGDZIE dla klienta.
-- ============================================================================

ALTER TABLE public.billing_gateways       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_features       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_features  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscription_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_audit_log      ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_gateways_select_admin ON public.billing_gateways
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

-- Katalog funkcji i cennik są jawne dla zalogowanych — front musi pokazać
-- ofertę. Nie ma tu nic wrażliwego: nazwy, ceny i limity i tak są na stronie.
CREATE POLICY billing_features_select_all ON public.billing_features
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY billing_plans_select_all ON public.billing_plans
  FOR SELECT TO authenticated USING (is_active);
CREATE POLICY billing_plan_features_select_all ON public.billing_plan_features
  FOR SELECT TO authenticated USING (true);

CREATE POLICY billing_subscriptions_select_admin ON public.billing_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));
CREATE POLICY billing_subscription_limits_select_admin ON public.billing_subscription_limits
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));
CREATE POLICY billing_usage_select_admin ON public.billing_usage
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));
CREATE POLICY billing_events_select_admin ON public.billing_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));
CREATE POLICY billing_settings_select_admin ON public.billing_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));
CREATE POLICY billing_audit_log_select_admin ON public.billing_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role));


-- ============================================================== GRANTY
-- Druga warstwa, tak samo jak w migracji lockdownu: bez grantu PostgREST nie
-- zapisze nawet gdyby ktoś później dołożył permisywną politykę.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.billing_gateways      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_features      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_plans         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_plan_features FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_subscription_limits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_usage         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_events        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_settings      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_audit_log     FROM anon, authenticated;

-- Funkcje uprawnień woła front (żeby pokazać albo ukryć moduł) i edge functions.
-- Zwracają wyłącznie flagi i limity, nie dane finansowe.
GRANT EXECUTE ON FUNCTION public.billing_active_subscription(public.billing_subscriber_type, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_active_plan(public.billing_subscriber_type, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_feature(public.billing_subscriber_type, uuid, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.feature_limit(public.billing_subscriber_type, uuid, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_usage(public.billing_subscriber_type, uuid, text, numeric) TO authenticated, service_role;


-- ============================================================== DANE STARTOWE
-- Wyłącznie po jednym wierszu konfiguracji na operatora, wyłączone i bez
-- sekretów. Planów i funkcji NIE zasiewam — nazwy pakietów muszą zostać
-- potwierdzone z cennikiem, a same kwoty (0/89/169, 139/289, 289) bez nazw
-- i przypisania funkcji dałyby tabelę, którą i tak trzeba by poprawiać ręcznie.
-- ============================================================================
INSERT INTO public.billing_gateways (provider, supports_subscriptions, supports_one_time)
VALUES
  ('stripe', true,  true),
  ('payu',   true,  true),
  ('p24',    false, true)
ON CONFLICT (provider) DO NOTHING;

COMMIT;

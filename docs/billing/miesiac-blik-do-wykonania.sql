-- ═══════════════════════════════════════════════════════════════════════════
-- MIESIĄC PLANU PŁATNY BLIK-iem — DWA KROKI, JEDNO WKLEJENIE
-- ═══════════════════════════════════════════════════════════════════════════
--   20260822170000  kształt zamówienia (plan_id) + wycena z gwarancją ceny
--   20260822190000  wydanie miesiąca, wygaśnięcie po miesiącu, zadanie 3:05
--
-- Osobne transakcje: gdyby druga padła, pierwsza zostaje w spójnym stanie.
--
-- Czego się spodziewać:
--   część 1: NOTICE  cena miesiąca Standard: 99.00 netto, 121.77 brutto ...
--            NOTICE  Kontrola: plan darmowy i indywidualny odmawiają wyceny.
--   część 2: NOTICE  zadanie billing-koniec-miesiaca: 3:05 UTC
--
-- PO WYKONANIU nic się nie zmienia dla nikogo — funkcje czekają na wdrożenie
-- `billing-payu-order`, `billing-payu-webhook` i frontu.
--
-- KOLEJNOŚĆ MA ZNACZENIE: front wdrażamy PO tych migracjach. Przycisk
-- „Zapłać BLIK-iem" wywołuje `billing_cena_miesiaca`; wdrożony wcześniej
-- byłby widoczny i odmawiałby.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═════════════════════════ 20260822170000_miesiac_blik_1_zamowienia ═════════════════════════

-- Miesiąc planu kupiony jednorazowo — krok 1: kształt zamówienia i cena.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- Tryb dokończenia mówi klientowi „wykup plan, żeby wrócić do pracy" i daje
-- przycisk. Ale jedyna droga prowadzi dziś przez Stripe z kartą, a część
-- warsztatów karty nie podepnie. Dla nich blokada nie ma wyjścia — pokazujemy
-- drzwi, które nie otwierają się ich kluczem.
--
-- Miesiąc płatny BLIK-iem przez PayU to pełnoprawna droga, nie awaryjna.
-- Po miesiącu blokada wraca i klient płaci ponownie, świadomie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO NIE „PRODUKT" W billing_addon_products
-- ═══════════════════════════════════════════════════════════════════════════
-- Tamta tabela ma kształt „cecha + liczba jednostek" (100 SMS-ów, 5 sprawdzeń).
-- Miesiąc planu nie jest liczbą jednostek — jest OKRESEM DOSTĘPU do zestawu
-- funkcji. Wciśnięcie go tam wymagałoby udawania, że plan to cecha, i psułoby
-- `billing_consume`, które chodzi po paczkach.
--
-- Zamiast tego `billing_orders` dostaje `plan_id` obok `product_id`. Zamówienie
-- jest albo doładowaniem, albo miesiącem planu — nigdy jednym i drugim.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Zamówienie może dotyczyć planu
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.billing_plans(id) ON DELETE RESTRICT;

-- `product_id` było NOT NULL, bo zamówienie mogło dotyczyć tylko doładowania.
ALTER TABLE public.billing_orders ALTER COLUMN product_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.billing_orders
    ADD CONSTRAINT billing_orders_produkt_albo_plan
    CHECK ((product_id IS NOT NULL AND plan_id IS NULL)
        OR (product_id IS NULL AND plan_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.billing_orders.plan_id IS
  'Miesiąc planu kupiony jednorazowo (PayU/BLIK). Wyklucza się z product_id.';

-- ---------------------------------------------------------------------------
-- 2. Cena miesiąca — z gwarancją ceny startowej
-- ---------------------------------------------------------------------------
-- Gwarancja z 4.20 działa przy Stripe przez PODMIANĘ obiektu ceny po dwunastu
-- miesiącach. Płatność jednorazowa nie ma subskrypcji w Stripe, więc nie ma
-- czego podmieniać — przenosimy więc gwarancję z „podmiany ceny" na „cenę
-- w chwili zakupu". Ta sama obietnica, inna droga egzekwowania.
--
-- Kiedy obowiązuje cena startowa:
--   • klient nie ma jeszcze subskrypcji w tej linii — pierwszy zakup, startowa;
--   • ma i `price_guarantee_until` jeszcze nie minęło — startowa;
--   • ma i minęło — docelowa (`price_net_target`).
--
-- Brak `price_net_target` znaczy „cena ostateczna, nie ma promocji" — wtedy
-- startowa obowiązuje zawsze.
CREATE OR REPLACE FUNCTION public.billing_cena_miesiaca(
  p_plan_code text,
  p_provider  uuid
)
RETURNS TABLE (
  plan_id      uuid,
  nazwa        text,
  cena_netto   numeric,
  vat_rate     numeric,
  cena_brutto  numeric,
  po_gwarancji boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan      billing_plans%ROWTYPE;
  v_gwarancja timestamptz;
  v_ma_sub    boolean;
  v_netto     numeric;
BEGIN
  SELECT * INTO v_plan FROM billing_plans
  WHERE code = p_plan_code AND product_line = 'warsztat';

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'PLAN_NIEZNANY: %', p_plan_code;
  END IF;
  IF v_plan.is_custom OR COALESCE(v_plan.price_net, 0) <= 0 THEN
    -- Plan indywidualny nie ma ceny, darmowy nie ma czego kupować.
    RAISE EXCEPTION 'PLAN_NIE_DO_KUPIENIA: %', p_plan_code;
  END IF;

  SELECT s.price_guarantee_until, true INTO v_gwarancja, v_ma_sub
  FROM billing_subscriptions s
  WHERE s.subscriber_type = 'service_provider'
    AND s.subscriber_id = p_provider
    AND s.product_line = 'warsztat'
  ORDER BY s.created_at DESC LIMIT 1;

  po_gwarancji := COALESCE(v_ma_sub, false)
                  AND v_gwarancja IS NOT NULL
                  AND v_gwarancja < now()
                  AND v_plan.price_net_target IS NOT NULL;

  v_netto := CASE WHEN po_gwarancji THEN v_plan.price_net_target ELSE v_plan.price_net END;

  plan_id     := v_plan.id;
  nazwa       := v_plan.name;
  cena_netto  := round(v_netto, 2);
  vat_rate    := v_plan.vat_rate;
  -- Zaokrąglenie na kwocie BRUTTO, nie na składnikach: to ona jest pobierana
  -- i to ona musi zgadzać się z fakturą co do grosza.
  cena_brutto := round(v_netto * (1 + v_plan.vat_rate / 100), 2);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_cena_miesiaca(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.billing_cena_miesiaca(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.billing_cena_miesiaca('warsztat_standard', NULL);
  IF r.cena_netto IS NULL OR r.cena_brutto <= r.cena_netto THEN
    RAISE EXCEPTION 'cena miesiąca policzona błędnie: netto=% brutto=%', r.cena_netto, r.cena_brutto;
  END IF;
  RAISE NOTICE 'cena miesiąca Standard: % netto, % brutto (po gwarancji: %)',
    r.cena_netto, r.cena_brutto, r.po_gwarancji;

  BEGIN
    PERFORM public.billing_cena_miesiaca('warsztat_free', NULL);
    RAISE EXCEPTION 'plan darmowy dał się wycenić — powinien odmówić';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PLAN_NIE_DO_KUPIENIA%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.billing_cena_miesiaca('warsztat_sieci', NULL);
    RAISE EXCEPTION 'plan indywidualny dał się wycenić — powinien odmówić';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PLAN_NIE_DO_KUPIENIA%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'Kontrola: plan darmowy i indywidualny odmawiają wyceny.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═════════════════════════ 20260822190000_miesiac_blik_2_wydanie ═════════════════════════

-- Miesiąc planu przez BLIK — krok 2: wydanie i wygaśnięcie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZNACZY „WYDANIE" PRZY MIESIĄCU
-- ═══════════════════════════════════════════════════════════════════════════
-- Przy doładowaniu wydanie zakłada paczkę. Przy miesiącu planu — przedłuża
-- OKRES DOSTĘPU: subskrypcja przechodzi na `active` z terminem o miesiąc dalej.
--
-- Odnowienie liczymy od PÓŹNIEJSZEJ z dwóch dat: końca bieżącego okresu albo
-- teraz. Klient, który zapłaci na trzy dni przed końcem, nie traci tych trzech
-- dni — a ten, który wraca po miesiącu przerwy, nie dostaje ich wstecz.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENCJA
-- ═══════════════════════════════════════════════════════════════════════════
-- Ta sama zasada co przy paczkach: blokada wiersza `FOR UPDATE` i znacznik
-- `wydane_at`. Powtórzone powiadomienie od operatora nie przedłuży miesiąca
-- drugi raz. To NIE jest teoretyczne — PayU ponawia powiadomienia.

BEGIN;

CREATE OR REPLACE FUNCTION public.billing_wydaj_miesiac(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_sub    billing_subscriptions%ROWTYPE;
  v_od     timestamptz;
  v_do     timestamptz;
BEGIN
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;

  IF v_zam.id IS NULL THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac: nie ma zamówienia %', p_order_id;
  END IF;
  IF v_zam.plan_id IS NULL THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac: zamówienie % nie dotyczy planu', p_order_id;
  END IF;
  -- Wydajemy WYŁĄCZNIE za opłacone. Bez tego wystarczyłoby wywołać funkcję
  -- na zamówieniu ze statusem `nowe`.
  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac: zamówienie % ma status %', p_order_id, v_zam.status;
  END IF;
  -- Powtórzone powiadomienie: nic nie robimy i mówimy to spokojnie.
  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_sub FROM billing_subscriptions
  WHERE subscriber_type = v_zam.subscriber_type
    AND subscriber_id   = v_zam.subscriber_id
    AND product_line    = 'warsztat'
  ORDER BY created_at DESC LIMIT 1;

  v_od := now();
  -- Późniejsza z dwóch: koniec bieżącego okresu albo teraz.
  v_do := GREATEST(COALESCE(v_sub.current_period_end, now()), now()) + interval '1 month';

  IF v_sub.id IS NULL THEN
    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status, provider,
       current_period_start, current_period_end, price_guarantee_until, price_snapshot)
    VALUES
      (v_zam.subscriber_type, v_zam.subscriber_id, v_zam.plan_id, 'active', 'payu',
       v_od, v_do,
       -- Gwarancja ceny startowej biegnie od PIERWSZEGO zakupu tego klienta,
       -- nie od daty kampanii. Przy kolejnych miesiącach jej nie przesuwamy.
       now() + interval '12 months',
       v_zam.snapshot)
    RETURNING id INTO v_sub.id;
  ELSE
    UPDATE billing_subscriptions
    SET plan_id              = v_zam.plan_id,
        -- `status` MUSI być w tym zapisie, nawet gdy już jest `active`:
        -- wyzwalacz `billing_znacznik_karencji` reaguje na UPDATE OF status
        -- i to on czyści tryb dokończenia. Pominięcie tej kolumny zostawiłoby
        -- opłaconego klienta z paskiem „zostały 3 dni".
        status               = 'active',
        provider             = 'payu',
        current_period_start = v_od,
        current_period_end   = v_do,
        price_guarantee_until = COALESCE(price_guarantee_until, now() + interval '12 months'),
        price_snapshot       = v_zam.snapshot,
        updated_at           = now()
    WHERE id = v_sub.id;
  END IF;

  UPDATE billing_orders
  SET wydane_at = now(), updated_at = now()
  WHERE id = p_order_id;

  RETURN v_sub.id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_wydaj_miesiac(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_miesiac(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Wygaśnięcie miesiąca
-- ---------------------------------------------------------------------------
-- Bez tego klient płaci RAZ i korzysta bez końca — a miesiąc jednorazowy ma się
-- kończyć. Subskrypcje ze Stripe zostają nietknięte: tam okres przedłuża webhook,
-- a wygaszanie po dacie odcięłoby płacącego przy spóźnionym powiadomieniu.
-- Stąd warunek po `provider = 'payu'`.
--
-- Wygasły miesiąc NIE blokuje od razu — wprowadza w tryb dokończenia, tak samo
-- jak koniec okresu próbnego i nieudana płatność. Jedna reguła, trzy powody.
CREATE OR REPLACE FUNCTION public.billing_konczy_sie_miesiac()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ile integer;
BEGIN
  UPDATE billing_subscriptions s
  SET dokanczanie_do    = public.termin_dokonczenia(s.subscriber_id),
      dokanczanie_powod = 'platnosc',
      updated_at        = now()
  WHERE s.status = 'active'
    AND s.provider = 'payu'
    AND s.subscriber_type = 'service_provider'
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end < now()
    AND s.dokanczanie_do IS NULL;

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_konczy_sie_miesiac: % warsztatów po opłaconym miesiącu', v_ile;
  END IF;
  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_konczy_sie_miesiac() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_konczy_sie_miesiac() TO service_role;

-- Razem z końcem okresu próbnego, o 3:00 — jedna reguła, jedna pora.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('billing-koniec-miesiaca')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-koniec-miesiaca');
    PERFORM cron.schedule('billing-koniec-miesiaca', '5 3 * * *',
      $cron$ SELECT public.billing_konczy_sie_miesiac(); $cron$);
    RAISE NOTICE 'zadanie billing-koniec-miesiaca: 3:05 UTC';
  ELSE
    RAISE WARNING 'pg_cron niedostępny — billing_konczy_sie_miesiac trzeba wołać z zewnątrz';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

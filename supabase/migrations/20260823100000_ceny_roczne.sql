-- Ceny roczne: dwa miesiące gratis, liczone z ceny miesięcznej.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- JEDNA STAŁA, NIE DRUGA CENA
-- ═══════════════════════════════════════════════════════════════════════════
-- Rok kosztuje DZIESIĘĆ miesięcy — klient płaci za 10, dostaje 12. Ta liczba
-- stoi w JEDNYM miejscu, w funkcji niżej.
--
-- Kusiło, żeby dopisać kolumnę `price_net_rok` obok `price_net`. Odrzucone:
-- dwie liczby to dwie liczby do rozjechania. Ktoś zmieni cenę miesiąca w panelu,
-- zapomni o rocznej i przez pół roku sprzedajemy rok taniej niż dwanaście
-- miesięcy — albo drożej, co gorsze.
--
-- Cena przekreślona (12 × miesiąc) też jest LICZONA, nie zapisana. Ma pokazywać
-- prawdę: tyle kosztowałoby dwanaście miesięcy kupowanych po kolei.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ceny roczne w Stripe — dwie kolumny obok miesięcznych
-- ---------------------------------------------------------------------------
-- Ceny w Stripe są NIEZMIENNE, więc każdy okres potrzebuje własnego obiektu.
-- Plan zostaje jeden; okres jest wyborem klienta, nie osobnym planem.
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_rok        text,
  ADD COLUMN IF NOT EXISTS stripe_price_id_rok_target text;

COMMENT ON COLUMN public.billing_plans.stripe_price_id_rok IS
  'Obiekt Price w Stripe dla subskrypcji ROCZNEJ w cenie startowej.';
COMMENT ON COLUMN public.billing_plans.stripe_price_id_rok_target IS
  'To samo dla ceny docelowej. Zadanie gwarancji ceny podmienia rok na rok, '
  'nie na miesiąc — inaczej przerzuciłoby klienta na inny okres rozliczeniowy.';

-- ---------------------------------------------------------------------------
-- 2. Wycena okresu
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_cena_okresu(
  p_plan_code text,
  p_provider  uuid,
  p_okres     text DEFAULT 'miesiac'
)
RETURNS TABLE (
  plan_id            uuid,
  nazwa              text,
  okres              text,
  miesiecy           integer,
  cena_netto         numeric,
  vat_rate           numeric,
  cena_brutto        numeric,
  -- Ile kosztowałoby dwanaście miesięcy po kolei. Do przekreślenia w interfejsie.
  bez_rabatu_netto   numeric,
  bez_rabatu_brutto  numeric,
  po_gwarancji       boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- ⬇ JEDYNE MIEJSCE, w którym stoi rabat roczny.
  c_miesiecy_platnych constant integer := 10;
  c_miesiecy_dostepu  constant integer := 12;

  v_plan      billing_plans%ROWTYPE;
  v_gwarancja timestamptz;
  v_ma_sub    boolean;
  v_mies      numeric;   -- cena za jeden miesiąc, po gwarancji albo startowa
  v_mnoznik   integer;
BEGIN
  IF p_okres NOT IN ('miesiac', 'rok') THEN
    RAISE EXCEPTION 'OKRES_NIEZNANY: %', p_okres;
  END IF;

  SELECT * INTO v_plan FROM billing_plans
  WHERE code = p_plan_code AND product_line = 'warsztat';

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'PLAN_NIEZNANY: %', p_plan_code;
  END IF;
  IF v_plan.is_custom OR COALESCE(v_plan.price_net, 0) <= 0 THEN
    -- Plan indywidualny wyceniamy rozmową, darmowy nie ma czego sprzedawać.
    RAISE EXCEPTION 'PLAN_NIE_DO_KUPIENIA: %', p_plan_code;
  END IF;

  SELECT s.price_guarantee_until, true INTO v_gwarancja, v_ma_sub
  FROM billing_subscriptions s
  WHERE s.subscriber_type = 'service_provider'
    AND s.subscriber_id = p_provider
    AND s.product_line = 'warsztat'
  ORDER BY s.created_at DESC LIMIT 1;

  -- Gwarancja biegnie od PIERWSZEGO zakupu klienta i obowiązuje przez rok,
  -- niezależnie od tego, czy kupował miesiącami, czy rokiem. Jedna reguła:
  -- cena startowa przez pierwszy rok, potem docelowa.
  po_gwarancji := COALESCE(v_ma_sub, false)
                  AND v_gwarancja IS NOT NULL
                  AND v_gwarancja < now()
                  AND v_plan.price_net_target IS NOT NULL;

  v_mies := CASE WHEN po_gwarancji THEN v_plan.price_net_target ELSE v_plan.price_net END;

  IF p_okres = 'rok' THEN
    v_mnoznik := c_miesiecy_platnych;
    miesiecy  := c_miesiecy_dostepu;
  ELSE
    v_mnoznik := 1;
    miesiecy  := 1;
  END IF;

  plan_id           := v_plan.id;
  nazwa             := v_plan.name;
  okres             := p_okres;
  cena_netto        := round(v_mies * v_mnoznik, 2);
  vat_rate          := v_plan.vat_rate;
  -- Zaokrąglenie na kwocie BRUTTO, nie na składnikach: to ona jest pobierana
  -- i to ona musi zgadzać się z fakturą co do grosza.
  cena_brutto       := round(v_mies * v_mnoznik * (1 + v_plan.vat_rate / 100), 2);
  bez_rabatu_netto  := round(v_mies * miesiecy, 2);
  bez_rabatu_brutto := round(v_mies * miesiecy * (1 + v_plan.vat_rate / 100), 2);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_cena_okresu(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_cena_okresu(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. `billing_cena_miesiaca` zostaje — jako NAKŁADKA, nie druga kopia
-- ---------------------------------------------------------------------------
-- Woła ją `billing-payu-order`. Zamiast przepisywać tamtą funkcję brzegową
-- i ryzykować rozjazd, zostawiamy nazwę i przekazujemy dalej. Jedno miejsce
-- z regułą ceny.
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.plan_id, o.nazwa, o.cena_netto, o.vat_rate, o.cena_brutto, o.po_gwarancji
  FROM public.billing_cena_okresu(p_plan_code, p_provider, 'miesiac') o;
$$;

REVOKE ALL ON FUNCTION public.billing_cena_miesiaca(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_cena_miesiaca(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE m record; r record; w record;
BEGIN
  SELECT * INTO m FROM public.billing_cena_okresu('warsztat_standard', NULL, 'miesiac');
  SELECT * INTO r FROM public.billing_cena_okresu('warsztat_standard', NULL, 'rok');

  IF r.cena_netto <> m.cena_netto * 10 THEN
    RAISE EXCEPTION 'rok ma kosztować dziesięć miesięcy: % zamiast %', r.cena_netto, m.cena_netto * 10;
  END IF;
  IF r.bez_rabatu_netto <> m.cena_netto * 12 THEN
    RAISE EXCEPTION 'cena przekreślona ma być dwunastoma miesiącami: %', r.bez_rabatu_netto;
  END IF;
  IF r.miesiecy <> 12 THEN
    RAISE EXCEPTION 'rok ma dawać dwanaście miesięcy dostępu, nie %', r.miesiecy;
  END IF;

  -- Nakładka musi zwracać dokładnie to samo, co wycena miesięczna.
  SELECT * INTO w FROM public.billing_cena_miesiaca('warsztat_standard', NULL);
  IF w.cena_brutto <> m.cena_brutto THEN
    RAISE EXCEPTION 'nakładka rozjechała się z wyceną: % vs %', w.cena_brutto, m.cena_brutto;
  END IF;

  BEGIN
    PERFORM public.billing_cena_okresu('warsztat_standard', NULL, 'kwartal');
    RAISE EXCEPTION 'nieznany okres dał się wycenić';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'OKRES_NIEZNANY%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'Standard: miesiąc % netto, rok % netto (zamiast %), dostęp % miesięcy',
    m.cena_netto, r.cena_netto, r.bez_rabatu_netto, r.miesiecy;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

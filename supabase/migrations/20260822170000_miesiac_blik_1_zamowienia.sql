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

-- Plan rozliczeń przypisywany DO KIEROWCY (kod: kolumny, polityki, wyzwalacz).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- Partner rozlicza część kierowców jako „8% podatku + 50 zł opłaty", a część
-- jako „159 zł ryczałtu bez podatku". Dziś stawka jest wyłącznie per miasto,
-- więc obu grup nie da się prowadzić w jednym mieście. Po tej migracji plan
-- jest własnością KIEROWCY i nadpisuje ustawienia miasta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZASADA: plan nadpisuje TYLKO to, co sam ustala
-- ═══════════════════════════════════════════════════════════════════════════
-- Puste pole w planie znaczy „zostaw jak było" (stawka miasta kierowcy, a dla
-- miasta bez własnego wiersza — stawka floty). Dzięki temu przypisanie planu
-- z pustymi polami NIE zmienia nikomu ani grosza. To jest cały powód, dla
-- którego `tax_percentage` NIE służy już do wyłączania podatku.
--
--   tax_enabled    = false  → podatek nie jest naliczany (ryczałt)
--   tax_percentage = NULL   → stawka z ustawień miasta
--   base_fee       = NULL   → opłata z ustawień miasta
--   settlement_mode= NULL   → tryb z ustawień miasta
--
-- Stary globalny plan „159" miał `tax_percentage = NULL` w znaczeniu „bez
-- podatku". Wypełnienie wsteczne niżej przenosi to znaczenie do `tax_enabled`,
-- żeby żaden istniejący wiersz nie zmienił zachowania.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO JESZCZE SPRAWDZIŁEM (CLAUDE.md: „zmiana w schemacie unieważnia założenie")
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. KTO CZYTA `settlement_plans`: SettlementPlanSelector, SettlementPlansManagement,
--    CompanyRevenueView, DriverDashboard, DriverExpandedPanel, DriverSettlements,
--    FleetSettlementsView oraz (po tej zmianie) funkcje `settlements`
--    i `recalculate-week`. Wszystkie czytają `select('*')` — nowe kolumny
--    niczego im nie psują, a `tax_enabled` czyta kod wdrażany razem z migracją.
-- 2. DRUGI KLUCZ OBCY: `settlement_plans` ma już klucz z `driver_app_users`.
--    Dokładamy klucz z `drivers` — ale w kodzie NIE MA ani jednego osadzenia
--    PostgREST po tej relacji (sprawdzone `grep 'settlement_plans('` w `src/`
--    i `supabase/functions/` — zero trafień), więc nie ma czego uczynić
--    niejednoznacznym.
-- 3. WYZWALACZE NA `drivers`: `initialize_documents_on_driver_creation` (AFTER
--    INSERT) i `update_drivers_updated_at` (BEFORE UPDATE). Żaden nie rusza
--    `settlement_plan_id`, żadna funkcja w bazie też (`pg_proc.prosrc ILIKE
--    '%settlement_plan_id%'` zwraca wyłącznie `sync_driver_billing_method`,
--    która pracuje na `driver_app_users`). Nie dokładamy więc drugiego
--    wyzwalacza do tej samej kolumny.
-- 4. KTO MA USTAWIAĆ nowe pole: nowy kierowca dostaje plan domyślny swojej
--    floty. Kierowców zakłada i panel, i import CSV, i zaproszenia — dlatego
--    robi to WYZWALACZ w bazie, a nie łatka w jednym formularzu.
--
-- Dane (zasiew planów, przypisanie istniejącym kierowcom) i więzy są w OSOBNEJ
-- migracji `20260914090100` — krok na danych nie ma prawa wycofać zmian kodu.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Plan może należeć do floty ───────────────────────────────────────────
ALTER TABLE public.settlement_plans
  ADD COLUMN IF NOT EXISTS fleet_id uuid REFERENCES public.fleets(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.settlement_plans.fleet_id IS
  'Flota, która ten plan utworzyła. NULL = plan ogólnoplatformowy (widoczny dla wszystkich).';

-- ── 2. Jawna flaga „czy naliczamy podatek" ─────────────────────────────────
ALTER TABLE public.settlement_plans
  ADD COLUMN IF NOT EXISTS tax_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.settlement_plans.tax_enabled IS
  'false = plan ryczałtowy: zero podatku i zero odliczenia VAT od paliwa.';
COMMENT ON COLUMN public.settlement_plans.tax_percentage IS
  'Stawka podatku w procentach. NULL = weź stawkę z ustawień miasta kierowcy.';
COMMENT ON COLUMN public.settlement_plans.base_fee IS
  'Opłata stała tygodniowa. NULL = weź opłatę z ustawień miasta kierowcy.';

-- Znaczenie starych wierszy przenosimy 1:1: dotąd „brak stawki" = „bez podatku".
UPDATE public.settlement_plans
   SET tax_enabled = (tax_percentage IS NOT NULL)
 WHERE tax_enabled IS DISTINCT FROM (tax_percentage IS NOT NULL);

-- ── 3. Tryb rozliczeń w planie ─────────────────────────────────────────────
ALTER TABLE public.settlement_plans
  ADD COLUMN IF NOT EXISTS settlement_mode text;

COMMENT ON COLUMN public.settlement_plans.settlement_mode IS
  'single_tax | dual_tax. NULL = tryb z ustawień miasta kierowcy.';

ALTER TABLE public.settlement_plans
  DROP CONSTRAINT IF EXISTS settlement_plans_settlement_mode_check;
ALTER TABLE public.settlement_plans
  ADD CONSTRAINT settlement_plans_settlement_mode_check
  CHECK (settlement_mode IS NULL OR settlement_mode IN ('single_tax', 'dual_tax'));

-- ── 4. Plan domyślny floty (dla nowych kierowców) ──────────────────────────
ALTER TABLE public.settlement_plans
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.settlement_plans.is_default IS
  'Plan, który dostaje nowy kierowca tej floty. Jeden na flotę (indeks w migracji 20260914090100).';

-- ── 5. Przypisanie planu do kierowcy ───────────────────────────────────────
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS settlement_plan_id uuid
  REFERENCES public.settlement_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.drivers.settlement_plan_id IS
  'Plan rozliczeń kierowcy. NULL = liczymy wyłącznie po ustawieniach miasta/floty.';

CREATE INDEX IF NOT EXISTS idx_drivers_settlement_plan ON public.drivers(settlement_plan_id);

-- ── 6. Polityki: flota zarządza SWOIMI planami ─────────────────────────────
-- Odczyt zostaje szeroki (cennik planów widzą kierowcy i panel), zapis wyłącznie
-- do własnych wierszy. Plan ogólnoplatformowy (fleet_id IS NULL) dalej tylko admin.
DROP POLICY IF EXISTS "settlement_plans_zapis_floty" ON public.settlement_plans;
CREATE POLICY "settlement_plans_zapis_floty"
  ON public.settlement_plans
  FOR ALL
  TO authenticated
  USING (
    fleet_id IS NOT NULL AND fleet_id IN (
      SELECT ur.fleet_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  )
  WITH CHECK (
    fleet_id IS NOT NULL AND fleet_id IN (
      SELECT ur.fleet_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  );

-- ── 7. Nowy kierowca dostaje plan domyślny swojej floty ────────────────────
-- Wyzwalacz, nie łatka w formularzu: kierowców zakłada panel floty, import CSV
-- z Ubera/Bolta (funkcja `settlements` tworzy brakujących) i zaproszenia.
-- Każde z tych miejsc, które by o polu zapomniało, zostawiłoby kierowcę bez
-- planu — czyli dokładnie ten wzorzec, który w tym repozytorium odmawiał już
-- zakupu klientom z kompletnymi danymi.
CREATE OR REPLACE FUNCTION public.ustaw_domyslny_plan_kierowcy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.settlement_plan_id IS NOT NULL OR NEW.fleet_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO NEW.settlement_plan_id
  FROM public.settlement_plans
  WHERE fleet_id = NEW.fleet_id
    AND is_default = true
    AND is_active = true
  LIMIT 1;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ustaw_domyslny_plan_kierowcy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ustaw_domyslny_plan_kierowcy() TO service_role;

DROP TRIGGER IF EXISTS trg_domyslny_plan_kierowcy ON public.drivers;
CREATE TRIGGER trg_domyslny_plan_kierowcy
  BEFORE INSERT ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.ustaw_domyslny_plan_kierowcy();

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ile integer;
BEGIN
  -- Kolumny są na miejscu.
  SELECT count(*) INTO v_ile FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'settlement_plans'
    AND column_name IN ('fleet_id', 'tax_enabled', 'settlement_mode', 'is_default');
  IF v_ile <> 4 THEN
    RAISE EXCEPTION 'Brakuje kolumn w settlement_plans (jest %, ma być 4)', v_ile;
  END IF;

  SELECT count(*) INTO v_ile FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'settlement_plan_id';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'drivers.settlement_plan_id nie powstała';
  END IF;

  -- Stare znaczenie przeniesione: plan bez stawki = plan bez podatku.
  SELECT count(*) INTO v_ile FROM public.settlement_plans
  WHERE tax_percentage IS NULL AND tax_enabled = true AND fleet_id IS NULL;
  IF v_ile > 0 THEN
    RAISE EXCEPTION 'Plan ogólny bez stawki został z tax_enabled = true (% szt.)', v_ile;
  END IF;

  -- DOKŁADNIE JEDEN wyzwalacz ustawia tę kolumnę. Dwa to nie podwójna ochrona,
  -- tylko niewiadoma — o kolejności decydują nazwy.
  SELECT count(*) INTO v_ile
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.drivers'::regclass AND NOT t.tgisinternal
    AND p.prosrc ILIKE '%settlement_plan_id%';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'Na drivers jest % wyzwalaczy ruszających settlement_plan_id, ma być 1', v_ile;
  END IF;

  RAISE NOTICE 'OK: kolumny, polityka floty i wyzwalacz domyślnego planu na miejscu.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- WYCOFANIE
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_domyslny_plan_kierowcy ON public.drivers;
-- DROP FUNCTION IF EXISTS public.ustaw_domyslny_plan_kierowcy();
-- DROP POLICY IF EXISTS "settlement_plans_zapis_floty" ON public.settlement_plans;
-- ALTER TABLE public.drivers DROP COLUMN IF EXISTS settlement_plan_id;
-- ALTER TABLE public.settlement_plans
--   DROP COLUMN IF EXISTS fleet_id,
--   DROP COLUMN IF EXISTS tax_enabled,
--   DROP COLUMN IF EXISTS settlement_mode,
--   DROP COLUMN IF EXISTS is_default;

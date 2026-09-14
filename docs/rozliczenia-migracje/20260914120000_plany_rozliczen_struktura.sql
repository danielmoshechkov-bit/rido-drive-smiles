-- Plany rozliczeń floty — STRUKTURA (tabele, polityki, wyzwalacz).
-- Dane i więzy na danych są w osobnej migracji `20260914120100`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ ZMIENIA I PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- Dotąd stawki były przywiązane do MIASTA: jeden komplet ustawień na miasto,
-- bez nazwy i bez możliwości prowadzenia dwóch grup kierowców w tym samym
-- mieście. Partner rozlicza część kierowców jako „8% + 50 zł", a część jako
-- „159 zł ryczałtu bez podatku" — i obie grupy jeżdżą po Warszawie.
--
-- Po tej migracji jednostką jest PLAN: ma nazwę, opcjonalne miasto, przełącznik
-- „domyślny" i — tak jak dziś — dwa komplety ustawień, osobno Bolt i Uber.
-- Ustawienia zostają tam, gdzie były (`fleet_city_settings`), tylko dostają
-- rodzica. Żaden wiersz nie zmienia wartości, więc żadna kwota się nie rusza.
--
-- RYCZAŁT NIE MA WŁASNEJ FLAGI: to plan ze stawką 0% i opłatą 159 zł. Zero
-- wychodzi z mnożenia, a jedna flaga mniej to jedno znaczenie mniej do
-- pomylenia (`tax_enabled` z wcześniejszej wersji tej paczki został wycofany).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PLAN OBOWIĄZUJE OD TYGODNIA, NIE „OD ZAWSZE"
-- ═══════════════════════════════════════════════════════════════════════════
-- Przypisanie to nie pole na kierowcy, tylko wiersz z datą w
-- `driver_plan_assignments`. Plan obowiązujący w tygodniu W to wiersz
-- o największym `effective_from <= początek W`. Dzięki temu zmiana planu nie
-- działa wstecz na tygodnie już rozliczone — a przypisanie zrobione świadomie
-- na starszym tygodniu działa od niego w przód.
--
-- Pole na kierowcy (`drivers.settlement_plan_id`) CELOWO nie powstaje: jedno
-- pole obok historii to dwa źródła prawdy i pewny rozjazd.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SPRAWDZIŁEM PRZED NAPISANIEM
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. WYZWALACZE NA `drivers`: `initialize_documents_on_driver_creation` (AFTER
--    INSERT) i `update_drivers_updated_at` (BEFORE UPDATE). Żaden nie dotyka
--    planów. Dokładamy JEDEN, AFTER INSERT, o innym zakresie.
-- 2. OSADZENIA POSTGREST: `fleet_city_settings` nie ma dziś ani jednego
--    osadzenia w kodzie (`grep "fleet_city_settings("` → zero trafień), więc
--    nowy klucz obcy do `fleet_settlement_plans` nie ma czego uczynić
--    niejednoznacznym.
-- 3. STARA TABELA `settlement_plans` (ogólnoplatformowa, pisana przez admina)
--    zostaje NIETKNIĘTA — to osobna funkcja: cennik planów pokazywany
--    kierowcom w ich aplikacji. Nie mieszamy tych dwóch bytów.
-- 4. UNIKALNOŚĆ `(fleet_id, city_name, platform)` na `fleet_city_settings`
--    musi zniknąć, bo od teraz dwa plany mogą wskazywać to samo miasto.
--    Zdejmujemy ją dopiero w migracji z danymi, po wypełnieniu `plan_id`.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Plan: nazwa, opcjonalne miasto, przełącznik „domyślny" ───────────────
CREATE TABLE IF NOT EXISTS public.fleet_settlement_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id    uuid NOT NULL REFERENCES public.fleets(id) ON DELETE CASCADE,
  name        text NOT NULL,
  city_name   text,
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.fleet_settlement_plans IS
  'Plan rozliczeń floty. Ustawienia Bolt/Uber leżą w fleet_city_settings.plan_id.';
COMMENT ON COLUMN public.fleet_settlement_plans.city_name IS
  'Miasto, dla którego plan powstał. Opcjonalne — plan nie musi być przywiązany do miasta.';
COMMENT ON COLUMN public.fleet_settlement_plans.is_default IS
  'Ten plan dostaje KAŻDY nowy kierowca floty. Przestawienie nie rusza kierowców już przypisanych.';

CREATE INDEX IF NOT EXISTS idx_fleet_settlement_plans_fleet ON public.fleet_settlement_plans(fleet_id);

ALTER TABLE public.fleet_settlement_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fleet_settlement_plans_odczyt" ON public.fleet_settlement_plans;
CREATE POLICY "fleet_settlement_plans_odczyt"
  ON public.fleet_settlement_plans FOR SELECT TO authenticated
  USING (
    fleet_id IN (SELECT ur.fleet_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    -- kierowca widzi plan swojej floty (pokazujemy mu jego nazwę w rozliczeniu)
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      JOIN public.driver_app_users dau ON dau.driver_id = d.id
      WHERE dau.user_id = auth.uid() AND d.fleet_id = fleet_settlement_plans.fleet_id
    )
  );

DROP POLICY IF EXISTS "fleet_settlement_plans_zapis_floty" ON public.fleet_settlement_plans;
CREATE POLICY "fleet_settlement_plans_zapis_floty"
  ON public.fleet_settlement_plans FOR ALL TO authenticated
  USING (
    fleet_id IN (
      SELECT ur.fleet_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  )
  WITH CHECK (
    fleet_id IN (
      SELECT ur.fleet_id FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  );

DROP TRIGGER IF EXISTS update_fleet_settlement_plans_updated_at ON public.fleet_settlement_plans;
CREATE TRIGGER update_fleet_settlement_plans_updated_at
  BEFORE UPDATE ON public.fleet_settlement_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. Dotychczasowe ustawienia stają się dziećmi planu ────────────────────
ALTER TABLE public.fleet_city_settings
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.fleet_settlement_plans(id) ON DELETE CASCADE;

-- Miasto przestaje być obowiązkowe: plan może nie dotyczyć konkretnego miasta.
ALTER TABLE public.fleet_city_settings ALTER COLUMN city_name DROP NOT NULL;

COMMENT ON COLUMN public.fleet_city_settings.plan_id IS
  'Plan, do którego należą te ustawienia. Dwa wiersze na plan: platform = bolt i uber.';
COMMENT ON COLUMN public.fleet_city_settings.city_name IS
  'Miasto planu (kopia z fleet_settlement_plans.city_name). Po nim liczą się tygodnie SPRZED pierwszego przypisania planu.';

CREATE INDEX IF NOT EXISTS idx_fleet_city_settings_plan ON public.fleet_city_settings(plan_id);

-- ── 3. Przypisania planu z datą obowiązywania ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_plan_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id      uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  -- NULL = „od tego tygodnia bez planu": wracamy do ustawień miasta kierowcy
  plan_id        uuid REFERENCES public.fleet_settlement_plans(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, effective_from)
);

COMMENT ON TABLE public.driver_plan_assignments IS
  'Historia planów kierowcy. Plan na tydzień W = wiersz o największym effective_from <= początek W.';
COMMENT ON COLUMN public.driver_plan_assignments.effective_from IS
  'Poniedziałek tygodnia, od którego plan obowiązuje. Wcześniejsze tygodnie zostają nietknięte.';

CREATE INDEX IF NOT EXISTS idx_driver_plan_assignments_lookup
  ON public.driver_plan_assignments(driver_id, effective_from DESC);

ALTER TABLE public.driver_plan_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_plan_assignments_odczyt" ON public.driver_plan_assignments;
CREATE POLICY "driver_plan_assignments_odczyt"
  ON public.driver_plan_assignments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_plan_assignments.driver_id
        AND (
          d.fleet_id IN (SELECT ur.fleet_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.driver_app_users dau
                     WHERE dau.driver_id = d.id AND dau.user_id = auth.uid())
        )
    )
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "driver_plan_assignments_zapis_floty" ON public.driver_plan_assignments;
CREATE POLICY "driver_plan_assignments_zapis_floty"
  ON public.driver_plan_assignments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_plan_assignments.driver_id
        AND d.fleet_id IN (
          SELECT ur.fleet_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role IN ('fleet_settlement', 'fleet_rental')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = driver_plan_assignments.driver_id
        AND d.fleet_id IN (
          SELECT ur.fleet_id FROM public.user_roles ur
          WHERE ur.user_id = auth.uid() AND ur.role IN ('fleet_settlement', 'fleet_rental')
        )
    )
  );

-- ── 4. Nowy kierowca dostaje plan oznaczony jako domyślny ──────────────────
-- Wyzwalacz, nie łatka w formularzu: kierowców zakłada panel floty, import CSV
-- z Ubera/Bolta (funkcja `settlements` tworzy brakujących) i zaproszenia.
-- Każde z tych miejsc, które by o tym zapomniało, zostawiłoby kierowcę bez planu.
--
-- Plan czytamy W CHWILI DODANIA kierowcy — przestawienie przełącznika
-- „domyślny" na inny plan nadaje go kolejnym nowym, a już dodanych nie rusza.
CREATE OR REPLACE FUNCTION public.nadaj_domyslny_plan_kierowcy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan uuid;
BEGIN
  IF NEW.fleet_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_plan
  FROM public.fleet_settlement_plans
  WHERE fleet_id = NEW.fleet_id AND is_default = true AND is_active = true
  LIMIT 1;

  IF v_plan IS NULL THEN
    RETURN NEW;  -- flota nie wskazała planu domyślnego — liczy się po mieście
  END IF;

  INSERT INTO public.driver_plan_assignments (driver_id, plan_id, effective_from)
  VALUES (NEW.id, v_plan, date_trunc('week', now())::date)
  ON CONFLICT (driver_id, effective_from) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.nadaj_domyslny_plan_kierowcy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nadaj_domyslny_plan_kierowcy() TO service_role;

DROP TRIGGER IF EXISTS trg_domyslny_plan_kierowcy ON public.drivers;
CREATE TRIGGER trg_domyslny_plan_kierowcy
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.nadaj_domyslny_plan_kierowcy();

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ile integer;
BEGIN
  SELECT count(*) INTO v_ile FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('fleet_settlement_plans', 'driver_plan_assignments');
  IF v_ile <> 2 THEN RAISE EXCEPTION 'Brakuje tabel planów (jest %, ma być 2)', v_ile; END IF;

  SELECT count(*) INTO v_ile FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'fleet_city_settings' AND column_name = 'plan_id';
  IF v_ile <> 1 THEN RAISE EXCEPTION 'fleet_city_settings.plan_id nie powstała'; END IF;

  -- Pole na kierowcy NIE ma prawa istnieć: historia jest jedynym źródłem prawdy.
  SELECT count(*) INTO v_ile FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'settlement_plan_id';
  IF v_ile <> 0 THEN
    RAISE EXCEPTION 'drivers.settlement_plan_id istnieje — dwa źródła prawdy o planie kierowcy';
  END IF;

  -- Dokładnie jeden wyzwalacz nadaje plan.
  SELECT count(*) INTO v_ile
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.drivers'::regclass AND NOT t.tgisinternal
    AND p.prosrc ILIKE '%driver_plan_assignments%';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'Na drivers jest % wyzwalaczy nadających plan, ma być 1', v_ile;
  END IF;

  RAISE NOTICE 'OK: tabele planów, polityki i wyzwalacz domyślnego planu na miejscu.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- WYCOFANIE (uruchamiać PO wycofaniu migracji 20260914120100)
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_domyslny_plan_kierowcy ON public.drivers;
-- DROP FUNCTION IF EXISTS public.nadaj_domyslny_plan_kierowcy();
-- DROP TABLE IF EXISTS public.driver_plan_assignments;
-- ALTER TABLE public.fleet_city_settings DROP COLUMN IF EXISTS plan_id;
-- ALTER TABLE public.fleet_city_settings ALTER COLUMN city_name SET NOT NULL;  -- tylko gdy brak wierszy bez miasta
-- DROP TABLE IF EXISTS public.fleet_settlement_plans;

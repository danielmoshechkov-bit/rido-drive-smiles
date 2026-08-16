-- Zamknięcie zapisu na tabelach, gdzie otwarty `true` dawał realną szkodę.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TŁUMACZENIA — defacement całej aplikacji
-- ═══════════════════════════════════════════════════════════════════════════
-- `ui_translations` czyta `useDynamicTranslations` i wstawia te napisy w
-- interfejs. Polityka brzmiała `FOR ALL USING (true)` bez klauzuli `TO`, czyli
-- dla wszystkich — mimo nazwy `service_write_ui_translations`. Każdy zalogowany
-- mógł przepisać teksty interfejsu CAŁEJ aplikacji, dla wszystkich
-- użytkowników. To samo dotyczy tłumaczeń ogłoszeń, kolejki tłumaczeń
-- i rejestru encji, który steruje tym, co w ogóle jest tłumaczone.
--
-- ZAMKNIĘCIE NIE ODBIERA NICZEGO. Sprawdzone przed napisaniem tej migracji:
-- przeglądarka NIE ZAPISUJE do żadnej z tych czterech tabel ani razu — zero
-- wystąpień insert/update/upsert/delete w całym froncie. Pisze do nich
-- wyłącznie `auto-translate-ui` i pokrewne funkcje brzegowe, kluczem
-- serwisowym, którego RLS nie dotyczy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EWIDENCJA SPRAWDZEŃ POJAZDU
-- ═══════════════════════════════════════════════════════════════════════════
-- `vehicle_lookup_usage` z otwartym zapisem pozwalała dopisać zmyślone
-- sprawdzenia. Jednostek to nie daje — te schodzą z paczek — ale psuje
-- ewidencję, a to z niej liczyliśmy zapytanie „sprawdzeń na zlecenie",
-- którym ustalaliśmy limity VIN w planach. Fałszywe dane w tej tabeli
-- przekładają się na złe decyzje cenowe.
--
-- Zapis idzie wyłącznie z `_shared/vinRozliczenie.ts`, klientem serwisowym.
-- Front nie zapisuje ani razu.
--
-- ODCZYT ZOSTAJE WSZĘDZIE NIETKNIĘTY. Zamykamy tylko zapis; gdyby zdejmowana
-- polityka `FOR ALL` była jedynym źródłem odczytu, odtwarzamy go — ta sama
-- pułapka, przez którą poprzednia migracja odcięła klientom słownik miast.

BEGIN;

DO $$
DECLARE
  v_tabela   text;
  v_polityka text;
  v_zdjete   integer := 0;
  v_tabele   text[] := ARRAY[
    'ui_translations',
    'listing_translations',
    'translation_queue',
    'translatable_entities',
    'vehicle_lookup_usage'
  ];
BEGIN
  FOREACH v_tabela IN ARRAY v_tabele LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_tabela
    ) THEN
      RAISE WARNING 'pomijam % — nie ma takiej tabeli', v_tabela;
      CONTINUE;
    END IF;

    -- Nie polegamy na nazwie polityki. W tej bazie „service_write_…"
    -- i „Service role manages…" bywały politykami dla roli `public`.
    FOR v_polityka IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tabela
        AND cmd <> 'SELECT'
        AND (roles::text[] && ARRAY['public', 'anon', 'authenticated'])
        AND COALESCE(btrim(qual), 'true') = 'true'
        AND (with_check IS NULL OR btrim(with_check) = 'true')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_polityka, v_tabela);
      v_zdjete := v_zdjete + 1;
      RAISE NOTICE 'zdjęto „%" z %', v_polityka, v_tabela;
    END LOOP;

    -- Odczyt taki, jaki był.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tabela
        AND cmd IN ('SELECT', 'ALL')
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
        v_tabela || '_odczyt_jak_dotad', v_tabela);
      RAISE NOTICE 'odtworzono odczyt na %', v_tabela;
    END IF;
  END LOOP;

  RAISE NOTICE 'Zdjęto % polityk otwartego zapisu.', v_zdjete;
END $$;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_zostalo text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_zostalo
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (ARRAY['ui_translations','listing_translations',
                               'translation_queue','translatable_entities',
                               'vehicle_lookup_usage'])
    AND cmd <> 'SELECT'
    AND (roles::text[] && ARRAY['public', 'anon', 'authenticated'])
    AND COALESCE(btrim(qual), 'true') = 'true';

  IF v_zostalo IS NOT NULL THEN
    RAISE EXCEPTION 'Nadal otwarty zapis: %', v_zostalo;
  END IF;

  RAISE NOTICE 'Kontrola przeszła: zapis wyłącznie rolą serwisową.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

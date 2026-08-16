-- Polityki „Admins can manage …" z rolą `public` i warunkiem `true`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO BYŁO NIE TAK
-- ═══════════════════════════════════════════════════════════════════════════
-- Dwadzieścia tabel miało politykę `FOR ALL USING (true)` bez klauzuli `TO`,
-- co w PostgreSQL znaczy `TO public` — czyli KAŻDA rola, łącznie z `anon`.
-- Nazwa mówiła „Admins can manage", warunek nie sprawdzał niczego.
--
-- To nie jest droga do pieniędzy — sprawdziłem, żadnej z tych tabel nie czyta
-- rozliczenie. Jest to droga do zepsucia działania platformy: ustawienia
-- deduplikacji rozliczeń, konfiguracja importów, słowniki, historia importów
-- i alarmy systemowe. Zalogowany klient mógł je zmienić albo skasować.
--
-- Na liście NIE MA `drivers`, `driver_documents`, `settlements`, `fuel_cards`
-- ani `driver_settlements` — dane osobowe kierowców są poza tym zestawem.
-- Sprawdzone na produkcji, nie założone.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WZORZEC POPRAWKI
-- ═══════════════════════════════════════════════════════════════════════════
-- Jeden dla wszystkich: `TO authenticated USING (has_role(auth.uid(),'admin'))`.
-- Nazwa polityki zostaje ta sama, żeby dało się ją odnaleźć w historii —
-- zmienia się wyłącznie to, kogo przepuszcza.
--
-- ODCZYT MUSI ZOSTAĆ TAKI, JAKI BYŁ — i to wymagało osobnej obsługi.
-- Zdejmowana polityka jest `FOR ALL`, więc dawała nie tylko zapis, ale też
-- ODCZYT. Samo jej usunięcie odcięłoby czytanie słowników (miasta, typy usług,
-- typy dokumentów) wszystkim poza administratorem i wygasiło formularze.
-- Wyszło na uruchomieniu: po pierwszej wersji tej migracji zwykły klient
-- widział ZERO miast.
--
-- Dlatego tam, gdzie po zdjęciu nie zostaje ŻADNA polityka odczytu, zakładamy
-- `FOR SELECT USING (true)` — czyli dokładnie to, co było. Nie poszerzamy
-- niczyich uprawnień; zamykamy wyłącznie zapis.

BEGIN;

DO $$
DECLARE
  v_tabela  text;
  v_polityka text;
  v_ile     integer := 0;
  v_tabele  text[] := ARRAY[
    'cities', 'system_alerts', 'fuel_logs', 'vehicle_damages', 'vehicle_inspections',
    'vehicle_policies', 'vehicle_services', 'settlement_periods', 'service_types',
    'document_types', 'import_errors', 'import_history', 'import_jobs',
    'manual_driver_matches', 'platform_import_config', 'rido_dedup_settings',
    'rido_visibility_settings', 'fleet_invitations', 'admin_communication_settings',
    'fleet_city_settings'
  ];
BEGIN
  FOREACH v_tabela IN ARRAY v_tabele LOOP
    -- Tabela mogła zniknąć albo nigdy nie powstać w tym środowisku.
    -- Pomijamy zamiast wywracać całą migrację przez jedną pozycję.
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_tabela
    ) THEN
      RAISE WARNING 'pomijam % — nie ma takiej tabeli', v_tabela;
      CONTINUE;
    END IF;

    -- Zdejmujemy KAŻDĄ politykę zapisu, która przepuszcza `public`, `anon`
    -- albo `authenticated` z warunkiem `true`. Nie polegamy na nazwie: nazwy
    -- w tej bazie bywają mylące („Service role manages…" przy roli public).
    FOR v_polityka IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tabela
        AND cmd <> 'SELECT'
        AND (roles::text[] && ARRAY['public', 'anon', 'authenticated'])
        AND (COALESCE(btrim(qual), 'true') = 'true')
        AND (with_check IS NULL OR btrim(with_check) = 'true')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_polityka, v_tabela);
      v_ile := v_ile + 1;
      RAISE NOTICE 'zdjęto „%" z %', v_polityka, v_tabela;
    END LOOP;

    -- Odczyt: jeśli po zdjęciu nie została żadna polityka SELECT, odtwarzamy
    -- ten, który dawała zdjęta polityka `FOR ALL`. Bez tego migracja zamyka
    -- odczyt przy okazji zamykania zapisu.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tabela
        AND cmd IN ('SELECT', 'ALL')
    ) THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR SELECT USING (true)
      $f$, v_tabela || '_odczyt_jak_dotad', v_tabela);
      RAISE NOTICE 'odtworzono odczyt na % (zdjęta polityka FOR ALL go dawała)', v_tabela;
    END IF;

    -- Nazwa mówi teraz prawdę: zapis dla administratora, nie dla wszystkich.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_tabela || '_zapis_admin', v_tabela);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'admin'::public.app_role))
        WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))
    $f$, v_tabela || '_zapis_admin', v_tabela);
  END LOOP;

  RAISE NOTICE 'Zdjęto % polityk zapisu dla wszystkich; założono politykę administratora na % tabelach',
    v_ile, array_length(v_tabele, 1);
END $$;

-- ---------------------------------------------------------------------------
-- Kontrola: na żadnej z tych tabel nie może zostać zapis dla klienta
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_zostalo text;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_zostalo
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (ARRAY[
      'cities', 'system_alerts', 'fuel_logs', 'vehicle_damages', 'vehicle_inspections',
      'vehicle_policies', 'vehicle_services', 'settlement_periods', 'service_types',
      'document_types', 'import_errors', 'import_history', 'import_jobs',
      'manual_driver_matches', 'platform_import_config', 'rido_dedup_settings',
      'rido_visibility_settings', 'fleet_invitations', 'admin_communication_settings',
      'fleet_city_settings'])
    AND cmd <> 'SELECT'
    AND (roles::text[] && ARRAY['public', 'anon'])
    AND COALESCE(btrim(qual), 'true') = 'true';

  IF v_zostalo IS NOT NULL THEN
    RAISE EXCEPTION 'Nadal otwarty zapis: %', v_zostalo;
  END IF;

  RAISE NOTICE 'Kontrola przeszła: zapis na tych tabelach wymaga roli administratora.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Wiarygodny ślad podpisu umowy najmu + zawężenie ustawień widoczności.
--
-- ⚠️ URUCHAMIAĆ PO DEPLOYU `rental-sign` I FRONTU. Ta migracja odbiera
-- przeglądarce prawo zapisu; bez wdrożonej funkcji podpis przestałby działać.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO BYŁO NIE TAK Z PODPISEM
-- ═══════════════════════════════════════════════════════════════════════════
-- Polityki portalu najmu sprawdzały `portal_access_token IS NOT NULL` — czyli
-- czy umowa MA token, a nie czy wołający go ZNA. Komentarz przy tamtej
-- migracji mówił to wprost: „The token check is done at application level for
-- now", a „application level" znaczyło przeglądarkę.
--
-- Skutki, wszystkie dostępne dla dowolnej osoby z kluczem anonimowym:
--   • oznaczenie DOWOLNEJ umowy jako podpisanej, z własnym obrazkiem podpisu,
--   • dopisanie do dziennika podpisu dowolnego zdarzenia, z dowolnym IP,
--   • odczyt każdej umowy najmu (dane najemcy, kwoty, pojazd).
--
-- Ta migracja zamyka DWA PIERWSZE. Trzeci — odczyt — zostaje i jest opisany
-- w sekcji 3; jego zamknięcie wymaga przepisania odczytu portalu i nie robię
-- tego przy okazji, bo to ścieżka, po której chodzą klienci podpisujący umowy.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Dziennik podpisu: zapis wyłącznie przez `rental-sign`
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.contract_signature_logs;
DROP POLICY IF EXISTS "Public can insert contract signature logs" ON public.contract_signature_logs;

-- Odczyt zostaje bez zmian — flota musi widzieć historię swojej umowy.
-- Jeśli zdjęte polityki były jedynym źródłem odczytu, odtwarzamy go.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contract_signature_logs'
      AND cmd IN ('SELECT', 'ALL')
  ) THEN
    CREATE POLICY "contract_signature_logs_odczyt_jak_dotad"
      ON public.contract_signature_logs FOR SELECT USING (true);
    RAISE NOTICE 'odtworzono odczyt dziennika podpisu';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Podpis umowy: koniec zapisu z przeglądarki
-- ---------------------------------------------------------------------------
-- Zdejmujemy politykę UPDATE dla `anon`/`authenticated`. Flota nadal edytuje
-- swoje umowy przez „Fleet can manage their rentals" (fleet_id = jej flota),
-- a najemca podpisuje przez `rental-sign`, która porównuje pełny token.
DROP POLICY IF EXISTS "Public can sign contract via portal token" ON public.vehicle_rentals;

-- ---------------------------------------------------------------------------
-- 3. ⚠️ ODCZYT UMÓW ZOSTAJE OTWARTY — świadomie, do osobnej decyzji
-- ---------------------------------------------------------------------------
-- Polityka „Public can read rentals with token" nadal pozwala każdemu odczytać
-- KAŻDĄ umowę mającą token — bez znajomości tego tokenu. To wyciek danych
-- najemców i warunków umów.
--
-- Nie zamykam jej tutaj, bo portal klienta czyta umowę wprost z bazy i jej
-- zdjęcie zgasiłoby ekran podpisu wszystkim. Poprawka to przeniesienie odczytu
-- do funkcji brzegowej (`rental-portal-get`), czyli osobna praca na ścieżce,
-- po której chodzą klienci.
--
-- Zostawiam to jako WIDOCZNY dług, nie jako przeoczenie.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicle_rentals'
      AND policyname = 'Public can read rentals with token'
  ) THEN
    RAISE WARNING 'ODCZYT UMÓW NADAL OTWARTY: polityka „Public can read rentals with token" przepuszcza każdego. Wymaga przeniesienia odczytu portalu do funkcji brzegowej.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Ustawienia widoczności rozliczeń — zapis tylko dla administratora
-- ---------------------------------------------------------------------------
-- Tabela jest JEDNA dla całej platformy (brak kolumny właściciela), więc
-- „zawężenie do właściciela" nie istnieje. Sprawdzone w `tab_permissions`:
-- zakładkę ma wyłącznie rola `admin`, więc zawężenie nie odbiera nikomu nic.
DO $$
DECLARE v_polityka text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='settlement_visibility_settings'
  ) THEN
    RAISE WARNING 'brak tabeli settlement_visibility_settings — pomijam';
    RETURN;
  END IF;

  FOR v_polityka IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'settlement_visibility_settings'
      AND cmd <> 'SELECT'
      AND (roles::text[] && ARRAY['public', 'anon', 'authenticated'])
      AND COALESCE(btrim(qual), 'true') = 'true'
      AND (with_check IS NULL OR btrim(with_check) = 'true')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.settlement_visibility_settings', v_polityka);
    RAISE NOTICE 'zdjęto „%"', v_polityka;
  END LOOP;

  -- Odczyt musi zostać: kierowcy i floty czytają te ustawienia, żeby wiedzieć,
  -- które kolumny rozliczeń pokazać.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='settlement_visibility_settings'
      AND cmd IN ('SELECT','ALL')
  ) THEN
    CREATE POLICY "svs_odczyt_jak_dotad"
      ON public.settlement_visibility_settings FOR SELECT USING (true);
  END IF;

  DROP POLICY IF EXISTS "svs_zapis_admin" ON public.settlement_visibility_settings;
  CREATE POLICY "svs_zapis_admin"
    ON public.settlement_visibility_settings
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
END $$;

-- ---------------------------------------------------------------------------
-- 5. Kontrola — po WARUNKU, nie po roli
-- ---------------------------------------------------------------------------
-- Pierwsza wersja tej kontroli pytała „czy istnieje polityka UPDATE dla anon".
-- To pytanie o ROLĘ, a w tej bazie prawie żadna polityka nie ma klauzuli TO,
-- więc wszystkie mają role `{public}` — łącznie z całkowicie bezpiecznymi
-- („Drivers can update own rentals", „Fleet can manage their rentals"). Kontrola
-- wywalała się na nich i cofała całą migrację razem ze zdjęciem dziurawej
-- polityki. To ta sama pomyłka co zakładanie nazw kolumn zamiast ich odczytania.
--
-- Pytanie właściwe brzmi: czy warunek zapisu w ogóle odwołuje się do tożsamości
-- wołającego. Polityka, której warunek nie wspomina `auth.uid()` ani `has_role`,
-- przepuszcza każdego, kto ma klucz anonimowy — niezależnie od tego, jak ładnie
-- wygląda (`portal_access_token IS NOT NULL` wyglądało jak sprawdzenie tokenu,
-- a było sprawdzeniem, czy token w ogóle istnieje).
--
-- Ograniczenie tej kontroli: sprawdza, czy warunek O TOŻSAMOŚCI PYTA, a nie czy
-- pyta dobrze. Polityka odwołująca się do `auth.uid()` w błędny sposób przejdzie.
DO $$
DECLARE v_zostalo text;
BEGIN
  SELECT string_agg(tablename || '.„' || policyname || '" [' || cmd || '] → ' ||
                    COALESCE(qual, with_check, '(brak warunku)'), E'\n  ')
    INTO v_zostalo
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('contract_signature_logs', 'settlement_visibility_settings', 'vehicle_rentals')
    AND cmd <> 'SELECT'
    AND (roles::text[] && ARRAY['public', 'anon', 'authenticated'])
    -- Warunek zapisu nie pyta, KTO pisze:
    AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) !~ 'auth\.uid\(\)|has_role';

  IF v_zostalo IS NOT NULL THEN
    RAISE EXCEPTION E'Zapis otwarty dla wołającego bez tożsamości:\n  %', v_zostalo;
  END IF;

  RAISE NOTICE 'Kontrola przeszła: podpis i dziennik wyłącznie przez rental-sign.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

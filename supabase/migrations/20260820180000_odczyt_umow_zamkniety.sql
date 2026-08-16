-- Zamknięcie odczytu umów najmu — dług zostawiony jawnie w poprzedniej migracji.
--
-- ⚠️ URUCHAMIAĆ PO DEPLOYU `rental-portal-get` I FRONTU. Ta migracja odbiera
-- przeglądarce prawo odczytu umowy; bez wdrożonej funkcji ekran podpisu
-- i ekran umowy przestaną się wczytywać.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO BYŁO OTWARTE
-- ═══════════════════════════════════════════════════════════════════════════
-- Polityka „Public can read rentals with token" miała warunek
-- `portal_access_token IS NOT NULL` — sprawdzała, że umowa MA token, a nie że
-- wołający go ZNA. Filtr po tokenie dokładała przeglądarka i wystarczyło go
-- pominąć.
--
-- Ekran umowy pobiera przy tym `*` ze złączeniami: PESEL najemcy, adres,
-- numer prawa jazdy, telefon, e-mail. Czyli dowolna osoba z kluczem
-- anonimowym — a ten jest w paczce JavaScriptu — mogła pobrać komplet danych
-- osobowych KAŻDEGO najemcy w systemie. To jest wyciek danych osobowych,
-- nie tylko usterka uprawnień.
--
-- Po tej migracji odczyt umowy mają:
--   • flota, do której umowa należy (istniejąca polityka `Fleet can view`),
--   • kierowca powiązany z umową (istniejąca polityka `Drivers can view own`),
--   • administrator,
--   • najemca z linku — przez `rental-portal-get`, kluczem serwisowym,
--     po porównaniu PEŁNEGO tokenu.

BEGIN;

DROP POLICY IF EXISTS "Public can read rentals with token" ON public.vehicle_rentals;

-- ---------------------------------------------------------------------------
-- Kontrola — obie strony, nie tylko zamknięcie
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_otwarte text;
  v_flota    integer;
BEGIN
  -- 1. Nie może zostać odczyt PRZEPUSZCZAJĄCY KAŻDEGO.
  --
  -- Kryterium to WARUNEK, nie rola. Pierwsza wersja tej kontroli sprawdzała
  -- rolę i zapaliła się na „Fleet can view their rentals" — polityce, która
  -- nie ma klauzuli `TO`, więc formalnie należy do `public`, ale jej warunek
  -- brzmi `fleet_id = get_user_fleet_id(auth.uid())` i dla anonima nie zwraca
  -- niczego. Brak `TO` jest w tej bazie regułą, nie wyjątkiem, więc kontrola
  -- oparta na roli blokowałaby migrację bez powodu.
  SELECT string_agg(policyname, ', ') INTO v_otwarte
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_rentals'
    AND cmd IN ('SELECT', 'ALL')
    AND (
      COALESCE(btrim(qual), 'true') = 'true'
      -- Wzorzec „ma token" zamiast „zna token" — ten, który zamykamy.
      OR qual ILIKE '%portal_access_token IS NOT NULL%'
    );

  IF v_otwarte IS NOT NULL THEN
    RAISE EXCEPTION 'Odczyt umów nadal otwarty dla anonimowych: %', v_otwarte;
  END IF;

  -- 2. Ale flota MUSI dalej widzieć swoje umowy. Migracja, która zamyka
  --    wyciek i przy okazji gasi panel floty, jest gorsza niż wyciek —
  --    bo zostanie cofnięta w pośpiechu razem z zamknięciem.
  SELECT count(*) INTO v_flota
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vehicle_rentals'
    AND cmd IN ('SELECT', 'ALL')
    AND qual ILIKE '%fleet_id%';

  IF v_flota = 0 THEN
    RAISE EXCEPTION 'Po zamknięciu nie została żadna polityka odczytu dla floty — panel przestałby działać';
  END IF;

  RAISE NOTICE 'Odczyt umów: anonimowi odcięci, flota widzi swoje (% polityk).', v_flota;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ZNACZNIK RODZAJU NABYWCY WYNIKA Z DANYCH, A NIE Z TEGO, KTÓRY FORMULARZ
-- BYŁ OSTATNI
-- ═══════════════════════════════════════════════════════════════════════════
-- `billing_dane_nabywcy_kompletne` wymaga `faktura_rodzaj_nabywcy`. Kolumnę
-- ustawia WYŁĄCZNIE okno zakupu (`src/components/billing/DaneDoFaktury.tsx`).
-- Te same kolumny firmowe zapisuje DZIESIĘĆ innych miejsc — kreator zakładu,
-- ustawienia warsztatu, rejestracja usługodawcy — i żadne z nich znacznika nie
-- dotyka. Warsztat z kompletem danych w ustawieniach jest więc dla bramki
-- „niekompletny" i przy zakupie dostaje formularz, w którym nie ma nic do
-- wpisania — tylko przycisk „To się zgadza".
--
-- To jest przypadek z listy w CLAUDE.md („kto ma USTAWIAĆ nowy warunek"):
-- miejsc zapisujących sąsiednie kolumny jest więcej niż jedno, więc właściwą
-- naprawą jest wyzwalacz w bazie, nie łatka w kolejnym formularzu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO TA MIGRACJA ROBI, A CZEGO NIE ROBI
-- ═══════════════════════════════════════════════════════════════════════════
-- Ustawia `faktura_rodzaj_nabywcy = 'firma'` TYLKO wtedy, gdy znacznika nie ma,
-- a dane są kompletne ORAZ jest poprawny dziesięciocyfrowy NIP. Wtedy nie ma
-- czego zgadywać: podmiot z NIP-em kupuje jako firma.
--
-- 🔴 NIE ustawia `'osoba'`. Brak NIP-u nie dowodzi, że nabywca jest osobą
-- prywatną — równie dobrze może znaczyć, że warsztat NIP-u jeszcze nie wpisał.
-- Zgadnięcie „osoba" wystawiłoby firmie fakturę bez NIP-u, czyli dokument do
-- korekty. Taki warsztat nadal zobaczy formularz i sam wybierze — i to jest
-- zamierzone.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ILE WIERSZY POWSTAŁO PO STAREMU — POLICZONE, NIE OSZACOWANE
-- ═══════════════════════════════════════════════════════════════════════════
-- Na 13.09.2026: 31 warsztatów, 7 ze znacznikiem, 24 bez. Z tych 24 komplet
-- danych firmowych ma **zero** — więc wyrównanie wsteczne nie ruszy dziś
-- ani jednego wiersza i jest zabezpieczeniem na przyszłość, nie naprawą
-- zastanego stanu. Kontrola na końcu to sprawdza i wypisuje liczby.

BEGIN;

CREATE OR REPLACE FUNCTION public.znacznik_nabywcy_z_danych()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funkcja$
BEGIN
  -- Wybór już dokonany zostaje nietknięty. Klient mógł świadomie wybrać
  -- „osoba" mimo posiadanego NIP-u i nie nam to zmieniać.
  IF NEW.faktura_rodzaj_nabywcy IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF btrim(COALESCE(NEW.company_name, '')) <> ''
     AND btrim(COALESCE(NEW.company_address, '')) <> ''
     AND btrim(COALESCE(NEW.company_city, '')) <> ''
     AND btrim(COALESCE(NEW.company_postal_code, '')) <> ''
     AND regexp_replace(COALESCE(NEW.company_nip, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
  THEN
    NEW.faktura_rodzaj_nabywcy := 'firma';
  END IF;

  RETURN NEW;
END;
$funkcja$;

REVOKE ALL ON FUNCTION public.znacznik_nabywcy_z_danych() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_znacznik_nabywcy_z_danych ON public.service_providers;

CREATE TRIGGER trg_znacznik_nabywcy_z_danych
BEFORE INSERT OR UPDATE OF company_name, company_nip, company_address,
                           company_city, company_postal_code
ON public.service_providers
FOR EACH ROW
EXECUTE FUNCTION public.znacznik_nabywcy_z_danych();

-- Wyrównanie wsteczne: te same warunki, bez dotykania wierszy z wyborem.
UPDATE public.service_providers
SET faktura_rodzaj_nabywcy = 'firma'
WHERE faktura_rodzaj_nabywcy IS NULL
  AND btrim(COALESCE(company_name, '')) <> ''
  AND btrim(COALESCE(company_address, '')) <> ''
  AND btrim(COALESCE(company_city, '')) <> ''
  AND btrim(COALESCE(company_postal_code, '')) <> ''
  AND regexp_replace(COALESCE(company_nip, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$';

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — Z PRZYPADKIEM, KTÓRY MA PRZEJŚĆ, I TAKIM, KTÓRY MA NIE PRZEJŚĆ
-- ═══════════════════════════════════════════════════════════════════════════
-- Sam zestaw „nic się nie zepsuło" wypadłby zielono także wtedy, gdyby
-- wyzwalacz w ogóle nie działał. Dlatego zapisujemy dwa wiersze próbne
-- i sprawdzamy OBA kierunki, po czym je kasujemy.
DO $kontrola$
DECLARE
  v_id_firma  uuid := gen_random_uuid();
  v_id_bez    uuid := gen_random_uuid();
  v_rodzaj_firma text;
  v_rodzaj_bez   text;
  v_bez_znacznika int;
  v_ze_znacznikiem int;
BEGIN
  IF to_regclass('public.service_providers') IS NULL THEN
    RAISE EXCEPTION 'kontrola: nie ma tabeli service_providers';
  END IF;

  -- 1. KOMPLET Z NIP-em → znacznik ma się ustawić SAM
  INSERT INTO public.service_providers
    (id, company_name, company_nip, company_address, company_city, company_postal_code)
  VALUES
    (v_id_firma, 'PRÓBA KONTROLNA', '1234563218', 'ul. Próbna 1', 'Warszawa', '00-001');
  SELECT faktura_rodzaj_nabywcy INTO v_rodzaj_firma
    FROM public.service_providers WHERE id = v_id_firma;
  IF v_rodzaj_firma IS DISTINCT FROM 'firma' THEN
    RAISE EXCEPTION 'kontrola pozytywna PADŁA: komplet z NIP-em nie dostał znacznika (jest %)', v_rodzaj_firma;
  END IF;

  -- 2. KOMPLET BEZ NIP-u → znacznik ma ZOSTAĆ pusty
  INSERT INTO public.service_providers
    (id, company_name, company_address, company_city, company_postal_code)
  VALUES
    (v_id_bez, 'PRÓBA KONTROLNA BEZ NIP', 'ul. Próbna 2', 'Warszawa', '00-002');
  SELECT faktura_rodzaj_nabywcy INTO v_rodzaj_bez
    FROM public.service_providers WHERE id = v_id_bez;
  IF v_rodzaj_bez IS NOT NULL THEN
    RAISE EXCEPTION 'kontrola odwrotna PADŁA: bez NIP-u znacznik został zgadnięty jako %', v_rodzaj_bez;
  END IF;

  DELETE FROM public.service_providers WHERE id IN (v_id_firma, v_id_bez);

  SELECT count(*) FILTER (WHERE faktura_rodzaj_nabywcy IS NULL),
         count(*) FILTER (WHERE faktura_rodzaj_nabywcy IS NOT NULL)
    INTO v_bez_znacznika, v_ze_znacznikiem
    FROM public.service_providers;

  RAISE NOTICE 'Kontrola przeszła. Warsztatów ze znacznikiem: %, bez znacznika: %.',
    v_ze_znacznikiem, v_bez_znacznika;
END;
$kontrola$;

COMMIT;

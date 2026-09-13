-- ═══════════════════════════════════════════════════════════════════════════
-- JEDEN WYZWALACZ RODZAJU NABYWCY — I KONIEC ZGADYWANIA „OSOBA"
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 TA MIGRACJA POPRAWIA WYZWALACZ Z `20260909155158`, NIE DOKŁADA DRUGIEGO.
--
-- Pierwsza wersja tego pliku zakładała nowy wyzwalacz obok istniejącego —
-- i padła na własnej kontroli odwrotnej, bo to STARY wyzwalacz ustawił
-- „osoba" na wierszu próbnym. Kontrola zadziałała dokładnie tak, jak miała:
-- zatrzymała zmianę, o której autor sądził, że wchodzi na czysto.
--
-- Wyzwalacz jest jeden: `trg_rodzaj_nabywcy` → `ustaw_rodzaj_nabywcy()`.
-- Tutaj zmieniamy WYŁĄCZNIE treść funkcji. Wyzwalacza nie ruszamy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ ZMIENIA I DLACZEGO ZDANIE JEST TERAZ INNE
-- ═══════════════════════════════════════════════════════════════════════════
-- Do dziś: komplet nazwy i adresu BEZ NIP-u → `osoba`.
-- Od dziś:  komplet nazwy i adresu BEZ NIP-u → NIC. Pyta okno zakupu.
--
-- Uzasadnienie z 09.09 brzmiało: „nazwa i adres bez NIP-u to osoba prywatna".
-- Brakowało w nim rachunku kosztów pomyłki, a on jest skrajnie niesymetryczny:
--
--   • zgadnięte „osoba", a to firma → faktura BEZ NIP-u. Nabywca nie odliczy
--     VAT-u, potrzebna korekta — a korekta idzie do KSeF na zawsze;
--   • nie zgadujemy nic → klient widzi JEDEN ekran i wybiera sam.
--
-- Puste pole NIP-u znaczy najczęściej „jeszcze nie wpisałem", nie „jestem
-- osobą prywatną" — tym bardziej że połowa formularzy w tym projekcie
-- NIP-u nie wymaga. `service_providers` to w dodatku tabela DZIAŁALNOŚCI:
-- warsztat prowadzony przez osobę prywatną jest sytuacją rzadką, a firma bez
-- wpisanego NIP-u — codzienną.
--
-- `firma` przy poprawnym dziesięciocyfrowym NIP-ie zostaje: tam nie ma czego
-- zgadywać, podmiot z NIP-em kupuje jako firma.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO Z TYM, CO JUŻ NADANO — POLICZONE, NIE OSZACOWANE
-- ═══════════════════════════════════════════════════════════════════════════
-- Na 13.09.2026, 31 warsztatów:
--   • 6 × `firma`  — wszystkie z poprawnym NIP-em, nowa reguła da to samo;
--   • 1 × `osoba`  — „Jan Audytowy", bez NIP-u, ZERO wystawionych faktur;
--   • 24 × NULL    — i żaden z nich nie ma kompletu danych firmowych.
--
-- Tego jednego wiersza NIE RUSZAMY. Powód: `osoba` mógł tam trafić z wyzwalacza
-- ALBO z świadomego wyboru klienta w oknie zakupu, a rozróżnić tego się nie da
-- — nie ma śladu, kto ustawił. Skasowanie cudzego wyboru jest gorsze niż
-- zostawienie znacznika na koncie bez faktur. To decyzja, nie przeoczenie.
-- Gdyby kiedyś trzeba było go wyczyścić, wystarczy:
--   UPDATE service_providers SET faktura_rodzaj_nabywcy = NULL WHERE id = '<id>';

BEGIN;

CREATE OR REPLACE FUNCTION public.ustaw_rodzaj_nabywcy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funkcja$
DECLARE
  v_nip   text := regexp_replace(coalesce(NEW.company_nip, ''), '[^0-9]', '', 'g');
  v_adres boolean;
BEGIN
  -- Świadomy wybór klienta jest nadrzędny. Nie ruszamy go nigdy.
  IF NEW.faktura_rodzaj_nabywcy IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_adres :=
        nullif(btrim(coalesce(NEW.company_name, '')), '')        IS NOT NULL
    AND nullif(btrim(coalesce(NEW.company_address, '')), '')     IS NOT NULL
    AND nullif(btrim(coalesce(NEW.company_city, '')), '')        IS NOT NULL
    AND nullif(btrim(coalesce(NEW.company_postal_code, '')), '') IS NOT NULL;

  IF NOT v_adres THEN
    RETURN NEW;   -- dane niekompletne — nie ma o czym mówić
  END IF;

  -- JEDYNY przypadek, w którym coś ustawiamy: poprawny dziesięciocyfrowy NIP.
  IF v_nip ~ '^[0-9]{10}$' THEN
    NEW.faktura_rodzaj_nabywcy := 'firma';
  END IF;

  -- 🔴 BRAK NIP-U NIE ZNACZY „OSOBA PRYWATNA" — patrz nagłówek. Zostawiamy
  -- pusto i pytamy raz w oknie zakupu. Jeden ekran jest tańszy niż korekta
  -- faktury, która w KSeF zostaje na zawsze.
  --
  -- NIP obecny, ale nie dziesięciocyfrowy: literówka. Też nie zgadujemy.

  RETURN NEW;
END;
$funkcja$;

REVOKE ALL ON FUNCTION public.ustaw_rodzaj_nabywcy() FROM PUBLIC, anon, authenticated;

-- Wyrównanie wsteczne dla reguły, która ZOSTAJE: komplet z NIP-em bez znacznika.
-- Na dziś to zero wierszy; zapis jest tu na przyszłość i dla powtarzalności.
UPDATE public.service_providers
SET faktura_rodzaj_nabywcy = 'firma'
WHERE faktura_rodzaj_nabywcy IS NULL
  AND btrim(COALESCE(company_name, '')) <> ''
  AND btrim(COALESCE(company_address, '')) <> ''
  AND btrim(COALESCE(company_city, '')) <> ''
  AND btrim(COALESCE(company_postal_code, '')) <> ''
  AND regexp_replace(COALESCE(company_nip, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$';

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — OBA KIERUNKI, NA ŻYWYM WYZWALACZU
-- ═══════════════════════════════════════════════════════════════════════════
DO $kontrola$
DECLARE
  v_id_firma uuid := gen_random_uuid();
  v_id_bez   uuid := gen_random_uuid();
  v_firma    text;
  v_bez      text;
  v_ile_wyzwalaczy int;
BEGIN
  -- 0. WYZWALACZ MA BYĆ JEDEN. Dwa naraz znaczą, że ktoś dołożył drugi obok
  --    istniejącego — i wtedy nie wiadomo, który z nich ustawia znacznik.
  SELECT count(*) INTO v_ile_wyzwalaczy
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE t.tgrelid = 'public.service_providers'::regclass
     AND NOT t.tgisinternal
     AND p.prosrc ILIKE '%faktura_rodzaj_nabywcy%';
  IF v_ile_wyzwalaczy <> 1 THEN
    RAISE EXCEPTION 'kontrola: wyzwalaczy ustawiających rodzaj nabywcy jest %, ma być dokładnie 1', v_ile_wyzwalaczy;
  END IF;

  -- 1. KOMPLET Z NIP-em → znacznik ustawia się SAM
  INSERT INTO public.service_providers
    (id, company_name, company_nip, company_address, company_city, company_postal_code)
  VALUES
    (v_id_firma, 'PRÓBA KONTROLNA', '1234563218', 'ul. Próbna 1', 'Warszawa', '00-001');
  SELECT faktura_rodzaj_nabywcy INTO v_firma
    FROM public.service_providers WHERE id = v_id_firma;
  IF v_firma IS DISTINCT FROM 'firma' THEN
    RAISE EXCEPTION 'kontrola pozytywna PADŁA: komplet z NIP-em nie dostał znacznika (jest %)', v_firma;
  END IF;

  -- 2. KOMPLET BEZ NIP-u → znacznik ma ZOSTAĆ pusty (to jest cała zmiana)
  INSERT INTO public.service_providers
    (id, company_name, company_address, company_city, company_postal_code)
  VALUES
    (v_id_bez, 'PRÓBA KONTROLNA BEZ NIP', 'ul. Próbna 2', 'Warszawa', '00-002');
  SELECT faktura_rodzaj_nabywcy INTO v_bez
    FROM public.service_providers WHERE id = v_id_bez;
  IF v_bez IS NOT NULL THEN
    RAISE EXCEPTION 'kontrola odwrotna PADŁA: bez NIP-u znacznik został zgadnięty jako %', v_bez;
  END IF;

  DELETE FROM public.service_providers WHERE id IN (v_id_firma, v_id_bez);

  RAISE NOTICE 'Kontrola przeszła: z NIP-em → firma, bez NIP-u → nic. Wyzwalacz jeden.';
END;
$kontrola$;

COMMIT;

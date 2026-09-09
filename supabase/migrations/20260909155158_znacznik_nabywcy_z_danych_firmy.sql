-- Znacznik rodzaju nabywcy ustawia się SAM, gdy dane firmy są kompletne.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 OBJAW: KLIENT UZUPEŁNIŁ DANE, A SYSTEM MÓWI, ŻE ICH NIE MA
-- ═══════════════════════════════════════════════════════════════════════════
-- Konto `daniel.m@car4ride.pl` po wypełnieniu Warsztat & Auto → Ustawienia →
-- Zakład miało w bazie komplet:
--
--   NIP 5272884984, ul. Biała 4/25, Warszawa, 00-895
--   faktura_rodzaj_nabywcy: NULL
--   billing_dane_nabywcy_kompletne: FALSE      ← odmowa zakupu
--
-- To samo `beatasmosarska2@gmail.com` (CART78 sp. z o.o., NIP 5272922561).
-- Bramka wymaga ZNACZNIKA, a formularz w Zakładzie go nie ustawia — ustawia go
-- wyłącznie `billing_zapisz_dane_nabywcy`, czyli krok „Dane do faktury" w oknie
-- zakupu. Klient, który wpisał wszystko tydzień wcześniej, i tak był pytany.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO WYZWALACZ, A NIE POPRAWKA W FORMULARZU
-- ═══════════════════════════════════════════════════════════════════════════
-- Te same pola zapisują TRZY miejsca frontu: `SettingsPanel`,
-- `WorkshopSettingsPage` i kreator `WorkshopSetupWizard` (a `service_providers`
-- pisze też rejestracja i panel administratora). Dopisanie znacznika w każdym
-- z nich to czwarte i piąte miejsce na tę samą decyzję — dokładnie ta klasa
-- błędu, którą opisuje pozycja 4.7 w STAN-PRAC („jeden ekran ustawień zamiast
-- trzech edytorów tych samych danych"). Wyzwalacz obowiązuje każdego, kto pisze
-- do tabeli, także kod, którego jeszcze nie ma.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO WYZWALACZ ROBI, A CZEGO NIE
-- ═══════════════════════════════════════════════════════════════════════════
-- Ustawia znacznik WYŁĄCZNIE wtedy, gdy jest pusty. Wyboru, który klient podjął
-- świadomie w oknie zakupu, NIE NADPISUJE — także wtedy, gdy dopisze potem NIP.
--
-- Ustawia go dopiero przy KOMPLECIE danych dla danego wariantu. Na danych
-- częściowych milczy: przy samym NIP-ie bez adresu ustawienie „firma" i tak
-- nie otworzyłoby bramki, a zamknęłoby drogę do wariantu „osoba prywatna".
--
-- Rozróżnienie jest TĄ SAMĄ regułą, której używa bramka
-- `billing_dane_nabywcy_kompletne`: poprawny dziesięciocyfrowy NIP → firma,
-- komplet nazwy i adresu bez NIP-u → osoba prywatna. Dzięki temu znacznik
-- nigdy nie mówi czegoś, czego bramka by nie przyjęła.

BEGIN;

CREATE OR REPLACE FUNCTION public.ustaw_rodzaj_nabywcy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_nip     text := regexp_replace(coalesce(NEW.company_nip, ''), '[^0-9]', '', 'g');
  v_adres   boolean;
BEGIN
  -- Świadomy wybór klienta jest nadrzędny. Nie ruszamy go nigdy.
  IF NEW.faktura_rodzaj_nabywcy IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_adres :=
        nullif(btrim(coalesce(NEW.company_name, '')), '')          IS NOT NULL
    AND nullif(btrim(coalesce(NEW.company_address, '')), '')       IS NOT NULL
    AND nullif(btrim(coalesce(NEW.company_city, '')), '')          IS NOT NULL
    AND nullif(btrim(coalesce(NEW.company_postal_code, '')), '')   IS NOT NULL;

  IF NOT v_adres THEN
    RETURN NEW;   -- dane niekompletne — nie zgadujemy
  END IF;

  IF v_nip ~ '^[0-9]{10}$' THEN
    NEW.faktura_rodzaj_nabywcy := 'firma';
  ELSIF v_nip = '' THEN
    NEW.faktura_rodzaj_nabywcy := 'osoba';
  END IF;
  -- NIP obecny, ale nie dziesięciocyfrowy: literówka. Nie ustawiamy nic —
  -- niech klient poprawi w oknie zakupu, zamiast dostać fakturę na zły numer.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rodzaj_nabywcy ON public.service_providers;
CREATE TRIGGER trg_rodzaj_nabywcy
  BEFORE INSERT OR UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.ustaw_rodzaj_nabywcy();

-- ---------------------------------------------------------------------------
-- WYRÓWNANIE WSTECZ
-- ---------------------------------------------------------------------------
-- Wyzwalacz działa od chwili założenia. Wiersze, które już mają komplet,
-- zostałyby bez znacznika do czasu, aż ktoś je zapisze ponownie — a klient
-- nie ma powodu wracać do ustawień, które już wypełnił.
--
-- Zmierzone przed migracją: 25 warsztatów bez znacznika, z tego DWA mają
-- komplet firmowy (`daniel.m@car4ride.pl`, `beatasmosarska2@gmail.com`)
-- i ZERO ma komplet osobowy. Reszta ma dane niepełne i ma zostać bez znacznika.
UPDATE public.service_providers
SET faktura_rodzaj_nabywcy = 'firma'
WHERE faktura_rodzaj_nabywcy IS NULL
  AND nullif(btrim(coalesce(company_name, '')), '')        IS NOT NULL
  AND nullif(btrim(coalesce(company_address, '')), '')     IS NOT NULL
  AND nullif(btrim(coalesce(company_city, '')), '')        IS NOT NULL
  AND nullif(btrim(coalesce(company_postal_code, '')), '') IS NOT NULL
  AND regexp_replace(coalesce(company_nip, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$';

UPDATE public.service_providers
SET faktura_rodzaj_nabywcy = 'osoba'
WHERE faktura_rodzaj_nabywcy IS NULL
  AND nullif(btrim(coalesce(company_name, '')), '')        IS NOT NULL
  AND nullif(btrim(coalesce(company_address, '')), '')     IS NOT NULL
  AND nullif(btrim(coalesce(company_city, '')), '')        IS NOT NULL
  AND nullif(btrim(coalesce(company_postal_code, '')), '') IS NOT NULL
  AND regexp_replace(coalesce(company_nip, ''), '[^0-9]', '', 'g') = '';

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — DZIAŁANIEM, NIE ODCZYTEM
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_zostalo int;
  v_bramka  int;
  v_probny  uuid;
  v_wynik   text;
BEGIN
  -- (a) Nie został ani jeden warsztat z kompletem danych i bez znacznika.
  SELECT count(*) INTO v_zostalo
  FROM service_providers
  WHERE faktura_rodzaj_nabywcy IS NULL
    AND nullif(btrim(coalesce(company_name, '')), '')        IS NOT NULL
    AND nullif(btrim(coalesce(company_address, '')), '')     IS NOT NULL
    AND nullif(btrim(coalesce(company_city, '')), '')        IS NOT NULL
    AND nullif(btrim(coalesce(company_postal_code, '')), '') IS NOT NULL;
  IF v_zostalo <> 0 THEN
    RAISE EXCEPTION 'Zostalo % warsztatow z kompletem danych i bez znacznika', v_zostalo;
  END IF;

  -- (b) BRAMKA NAPRAWDĘ PRZEPUSZCZA. Sam znacznik nic nie znaczy, jeśli
  --     `billing_dane_nabywcy_kompletne` dalej mówi „nie". To jest ten krok,
  --     którego zabrakło przy dziewięciu poprzednich razach: kontrola pytała
  --     o zapis, a nie o skutek.
  SELECT count(*) INTO v_bramka
  FROM service_providers sp
  WHERE sp.faktura_rodzaj_nabywcy IS NOT NULL
    AND NOT public.billing_dane_nabywcy_kompletne(sp.id);
  IF v_bramka <> 0 THEN
    RAISE EXCEPTION 'Znacznik ustawiony, ale bramka odmawia dla % warsztatow', v_bramka;
  END IF;

  -- (c) WYZWALACZ DZIAŁA NA ŻYWO. Zakładamy wiersz próbny z kompletem danych
  --     i sprawdzamy, czy znacznik pojawił się SAM. Bez tego kontrola mówiłaby
  --     wyłącznie o wyrównaniu wstecz, a wyzwalacz mógłby być martwy.
  v_probny := gen_random_uuid();
  INSERT INTO service_providers (id, company_name, company_nip, company_address, company_city, company_postal_code)
  VALUES (v_probny, 'KONTROLA MIGRACJI', '5272884984', 'ul. Testowa 1', 'Warszawa', '00-001');

  SELECT faktura_rodzaj_nabywcy INTO v_wynik FROM service_providers WHERE id = v_probny;
  IF v_wynik IS DISTINCT FROM 'firma' THEN
    RAISE EXCEPTION 'Wyzwalacz nie ustawil znacznika przy komplecie firmowym (dostalem %)', coalesce(v_wynik, 'NULL');
  END IF;

  -- Wariant osobowy: ten sam wiersz bez NIP-u.
  UPDATE service_providers SET faktura_rodzaj_nabywcy = NULL, company_nip = NULL WHERE id = v_probny;
  SELECT faktura_rodzaj_nabywcy INTO v_wynik FROM service_providers WHERE id = v_probny;
  IF v_wynik IS DISTINCT FROM 'osoba' THEN
    RAISE EXCEPTION 'Wyzwalacz nie ustawil znacznika przy komplecie osobowym (dostalem %)', coalesce(v_wynik, 'NULL');
  END IF;

  -- KONTROLA ODWROTNA: przy danych niepełnych ma NIE ustawiać nic. Bez tego
  -- test przechodziłby także dla wyzwalacza ustawiającego znacznik zawsze.
  UPDATE service_providers SET faktura_rodzaj_nabywcy = NULL, company_city = NULL WHERE id = v_probny;
  SELECT faktura_rodzaj_nabywcy INTO v_wynik FROM service_providers WHERE id = v_probny;
  IF v_wynik IS NOT NULL THEN
    RAISE EXCEPTION 'Wyzwalacz ustawil znacznik mimo braku miasta — zgaduje zamiast czekac';
  END IF;

  -- KONTROLA ODWROTNA 2: wyboru klienta nie nadpisuje.
  UPDATE service_providers
  SET faktura_rodzaj_nabywcy = 'osoba', company_city = 'Warszawa', company_nip = '5272884984'
  WHERE id = v_probny;
  SELECT faktura_rodzaj_nabywcy INTO v_wynik FROM service_providers WHERE id = v_probny;
  IF v_wynik <> 'osoba' THEN
    RAISE EXCEPTION 'Wyzwalacz nadpisal swiadomy wybor klienta na %', v_wynik;
  END IF;

  DELETE FROM service_providers WHERE id = v_probny;

  RAISE NOTICE 'Znacznik nabywcy: wyzwalacz dziala w obie strony, wyrownanie wstecz zamkniete, bramka przepuszcza.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

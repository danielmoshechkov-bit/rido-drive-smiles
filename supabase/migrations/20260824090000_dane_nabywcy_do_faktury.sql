-- Dane nabywcy do faktury — pytane PRZED płatnością, nie po.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO PRZED
-- ═══════════════════════════════════════════════════════════════════════════
-- Faktury z błędnym albo pustym nabywcą nie da się poprawić edycją. Wymaga
-- korekty, a korekta idzie do KSeF i zostaje w ewidencji na zawsze. Jeden
-- klient to pięć minut pracy, pięćdziesięciu to osobne zajęcie.
--
-- Stan zastany: dane nabywcy webhook bierze z kolumn `service_providers`,
-- a wypełnione ma je **4 z 27 warsztatów**. To nie jest przypadek brzegowy,
-- tylko stan domyślny. Włączenie automatycznego fakturowania bez tego kroku
-- wyprodukowałoby 23 faktury do korekty.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- OSOBA FIZYCZNA TEŻ KUPUJE
-- ═══════════════════════════════════════════════════════════════════════════
-- Warsztat prowadzony bez firmy ma móc zapłacić. Dlatego `rodzaj_nabywcy`:
-- „firma" wymaga NIP-u, „osoba" wymaga imienia, nazwiska i adresu.
--
-- Bez tego rozróżnienia kontrola „ma NIP = można sprzedawać" blokowałaby
-- osoby fizyczne, a kontrola „nie sprawdzamy NIP-u" przepuszczałaby firmy
-- bez niego. Znacznik mówi, KTÓRY zestaw pól jest kompletem.
--
-- Zapisujemy do kolumn `service_providers`, bo to z nich czyta webhook
-- wystawiający fakturę. Osobna tabela znaczyłaby zmianę w funkcji brzegowej
-- utrzymywanej przez równoległą sesję — a mamy się do niej podłączyć,
-- nie przerabiać jej.

BEGIN;

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS faktura_rodzaj_nabywcy text,
  ADD COLUMN IF NOT EXISTS faktura_dane_potwierdzone_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_providers_rodzaj_nabywcy_check'
  ) THEN
    ALTER TABLE public.service_providers
      ADD CONSTRAINT service_providers_rodzaj_nabywcy_check
      CHECK (faktura_rodzaj_nabywcy IS NULL OR faktura_rodzaj_nabywcy IN ('firma', 'osoba'));
  END IF;
END $$;

COMMENT ON COLUMN public.service_providers.faktura_rodzaj_nabywcy IS
  'firma = wymagany NIP; osoba = imię, nazwisko i adres bez NIP-u. Puste = klient jeszcze nie podał danych do faktury.';
COMMENT ON COLUMN public.service_providers.faktura_dane_potwierdzone_at IS
  'Kiedy klient ostatni raz potwierdził dane na fakturę. Do sporu „nie podawałem takiego adresu".';

-- ---------------------------------------------------------------------------
-- Czy komplet danych jest
-- ---------------------------------------------------------------------------
-- Jedna funkcja, z której korzysta i interfejs (żeby wiedzieć, czy pytać),
-- i bramka płatności (żeby nie wpuścić bez danych). Dwie osobne implementacje
-- rozjechałyby się przy pierwszej zmianie wymagań — a rozjazd znaczyłby albo
-- pytanie o coś, czego nie trzeba, albo fakturę bez nabywcy.
CREATE OR REPLACE FUNCTION public.billing_dane_nabywcy_kompletne(p_provider_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
  SELECT COALESCE((
    SELECT CASE sp.faktura_rodzaj_nabywcy
             WHEN 'firma' THEN
               COALESCE(NULLIF(btrim(sp.company_name), ''), NULL) IS NOT NULL
               AND regexp_replace(COALESCE(sp.company_nip, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
               AND COALESCE(NULLIF(btrim(sp.company_address), ''), NULL) IS NOT NULL
               AND COALESCE(NULLIF(btrim(sp.company_city), ''), NULL) IS NOT NULL
               AND COALESCE(NULLIF(btrim(sp.company_postal_code), ''), NULL) IS NOT NULL
             WHEN 'osoba' THEN
               COALESCE(NULLIF(btrim(sp.company_name), ''), NULL) IS NOT NULL
               AND COALESCE(NULLIF(btrim(sp.company_address), ''), NULL) IS NOT NULL
               AND COALESCE(NULLIF(btrim(sp.company_city), ''), NULL) IS NOT NULL
               AND COALESCE(NULLIF(btrim(sp.company_postal_code), ''), NULL) IS NOT NULL
             ELSE false
           END
    FROM service_providers sp WHERE sp.id = p_provider_id
  ), false);
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_dane_nabywcy_kompletne(uuid) FROM PUBLIC, anon;
-- Zalogowany MUSI móc to sprawdzić — okno zakupu pyta o to przed pokazaniem
-- kroku. Funkcja niczego nie ujawnia poza „tak/nie" dla wskazanego warsztatu.
GRANT EXECUTE ON FUNCTION public.billing_dane_nabywcy_kompletne(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Zapis danych nabywcy
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_zapisz_dane_nabywcy(
  p_provider_id uuid,
  p_rodzaj      text,
  p_nazwa       text,
  p_nip         text,
  p_adres       text,
  p_kod         text,
  p_miasto      text,
  p_email       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_wlasciciel uuid;
  v_nip        text := regexp_replace(COALESCE(p_nip, ''), '[^0-9]', '', 'g');
BEGIN
  -- WŁAŚCICIELSTWO SPRAWDZAMY TU, NIE UFAMY WYWOŁUJĄCEMU. Funkcja jest
  -- SECURITY DEFINER, więc bez tego dowolny zalogowany podmieniłby dane
  -- na fakturze cudzego warsztatu.
  SELECT user_id INTO v_wlasciciel FROM service_providers WHERE id = p_provider_id;
  IF v_wlasciciel IS NULL THEN
    RAISE EXCEPTION 'NIE_MA_WARSZTATU';
  END IF;
  IF v_wlasciciel <> auth.uid() THEN
    RAISE EXCEPTION 'NIE_TWOJ_WARSZTAT';
  END IF;

  IF p_rodzaj NOT IN ('firma', 'osoba') THEN
    RAISE EXCEPTION 'ZLY_RODZAJ: % — dopuszczalne „firma" albo „osoba"', p_rodzaj;
  END IF;

  IF COALESCE(btrim(p_nazwa), '') = '' THEN
    RAISE EXCEPTION 'BRAK_NAZWY';
  END IF;
  IF COALESCE(btrim(p_adres), '') = '' OR COALESCE(btrim(p_kod), '') = ''
     OR COALESCE(btrim(p_miasto), '') = '' THEN
    RAISE EXCEPTION 'BRAK_ADRESU';
  END IF;

  -- NIP sprawdzamy SUMĄ KONTROLNĄ, nie samą długością. Dziesięć cyfr
  -- z literówką przechodzi kontrolę długości i ląduje na fakturze, a wtedy
  -- jedyną drogą wyjścia jest korekta.
  IF p_rodzaj = 'firma' THEN
    IF v_nip !~ '^[0-9]{10}$' THEN
      RAISE EXCEPTION 'ZLY_NIP: NIP ma dziesięć cyfr';
    END IF;
    IF ((substr(v_nip,1,1)::int * 6 + substr(v_nip,2,1)::int * 5 + substr(v_nip,3,1)::int * 7
       + substr(v_nip,4,1)::int * 2 + substr(v_nip,5,1)::int * 3 + substr(v_nip,6,1)::int * 4
       + substr(v_nip,7,1)::int * 5 + substr(v_nip,8,1)::int * 6 + substr(v_nip,9,1)::int * 7)
       % 11) <> substr(v_nip,10,1)::int THEN
      RAISE EXCEPTION 'ZLY_NIP: suma kontrolna się nie zgadza';
    END IF;
  END IF;

  UPDATE service_providers SET
    faktura_rodzaj_nabywcy       = p_rodzaj,
    company_name                 = btrim(p_nazwa),
    company_nip                  = CASE WHEN p_rodzaj = 'firma' THEN v_nip ELSE NULL END,
    company_address              = btrim(p_adres),
    company_postal_code          = btrim(p_kod),
    company_city                 = btrim(p_miasto),
    company_email                = COALESCE(NULLIF(btrim(p_email), ''), company_email),
    faktura_dane_potwierdzone_at = now(),
    updated_at                   = now()
  WHERE id = p_provider_id;

  RETURN jsonb_build_object(
    'ok', true,
    'kompletne', public.billing_dane_nabywcy_kompletne(p_provider_id)
  );
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_zapisz_dane_nabywcy(uuid, text, text, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_zapisz_dane_nabywcy(uuid, text, text, text, text, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wyrównanie wstecz: kto MA komplet, ten ma też znacznik
-- ---------------------------------------------------------------------------
-- Cztery warsztaty mają już NIP i adres. Bez znacznika okno zakupu pytałoby
-- ich o dane, które od dawna są w bazie — czyli karałoby za bycie kompletnym.
UPDATE service_providers sp
SET faktura_rodzaj_nabywcy = 'firma', updated_at = now()
WHERE sp.faktura_rodzaj_nabywcy IS NULL
  AND regexp_replace(COALESCE(sp.company_nip, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
  AND COALESCE(NULLIF(btrim(sp.company_address), ''), NULL) IS NOT NULL
  AND COALESCE(NULLIF(btrim(sp.company_city), ''), NULL) IS NOT NULL
  AND COALESCE(NULLIF(btrim(sp.company_postal_code), ''), NULL) IS NOT NULL;

DO $KONTROLA$
DECLARE v_gotowych int; v_wszystkich int;
BEGIN
  SELECT count(*) FILTER (WHERE public.billing_dane_nabywcy_kompletne(id)), count(*)
    INTO v_gotowych, v_wszystkich
  FROM service_providers;

  RAISE NOTICE 'Dane do faktury kompletne: % z % warsztatów.', v_gotowych, v_wszystkich;

  -- Kontrola sensu, nie liczby: warsztat oznaczony jako „firma" bez poprawnego
  -- NIP-u znaczyłby, że wyrównanie wstecz objęło kogoś, kogo nie powinno.
  IF EXISTS (
    SELECT 1 FROM service_providers
    WHERE faktura_rodzaj_nabywcy = 'firma'
      AND regexp_replace(COALESCE(company_nip, ''), '[^0-9]', '', 'g') !~ '^[0-9]{10}$'
  ) THEN
    RAISE EXCEPTION 'Wyrównanie wstecz oznaczyło jako firmę warsztat bez NIP-u';
  END IF;
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';

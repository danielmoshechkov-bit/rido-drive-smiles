-- Audyt przedsprzedażowy: usunięcie `sms_balance` i normalizacja adresu e-mail.
--
-- ⚠️ URUCHAMIAĆ PO DEPLOYU FRONTU. Panel administratora czyta dziś pole
-- `sms_balance` z `admin_list_service_providers`; po zmianie nazwy kolumny
-- stary front pokazywałby puste saldo. Kolejność: front → migracja.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO USUWAMY KOLUMNĘ, A NIE „PILNUJEMY JEJ"
-- ═══════════════════════════════════════════════════════════════════════════
-- Lockdown z 05.08 założył trigger `guard_sms_balance`, który miał odrzucać
-- zmianę tej kolumny z konta klienta. Warunek brzmiał:
--
--     IF NEW.sms_balance IS DISTINCT FROM OLD.sms_balance
--        AND current_user = 'authenticated'
--
-- Ten warunek jest ZAWSZE FAŁSZYWY. Funkcja jest `SECURITY DEFINER`, a w takiej
-- funkcji `current_user` to WŁAŚCICIEL funkcji (`postgres`), nie rola, która
-- wykonuje zapytanie. Sprawdzone wykonaniem: trigger wypisuje
-- `current_user=postgres` przy zapisie zrobionym jako `authenticated`,
-- i przepuszcza zmianę.
--
-- Czyli od 5 sierpnia istniała bariera, w którą wszyscy wierzyli, a której
-- nie było. W połączeniu z bramką wysyłki czytającą tę kolumnę dawało to
-- działającą drogę do darmowych SMS-ów (naprawione po stronie funkcji 16.08).
--
-- Kolumna jest po migracji 4.10 martwa — wysyłka liczy pulę planu i paczki.
-- Zamiast naprawiać strażnika martwej kolumny, usuwamy jedno i drugie.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Nadawanie SMS-ów trafia do paczek, nie do martwej kolumny
-- ---------------------------------------------------------------------------
-- `payment-core` (nadanie z panelu administratora) woła tę funkcję. Dotąd
-- zapisywała do `sms_balance`, więc od 4.10 nadanie było dla klienta
-- NIEWIDOCZNE — ta sama klasa błędu co pakiet startowy. Poprawiamy funkcję,
-- a nie wywołujących: dzięki temu każdy przyszły wywołujący jest poprawny
-- z automatu.
CREATE OR REPLACE FUNCTION public.grant_sms_credits(
  p_provider_id uuid,
  p_ile         integer,
  p_powod       text DEFAULT 'nadanie_admin',
  p_actor       uuid DEFAULT NULL,
  p_opis        text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sms    uuid;
  v_wynik  jsonb;
BEGIN
  IF p_ile IS NULL OR p_ile = 0 THEN
    RAISE EXCEPTION 'grant_sms_credits: liczba SMS-ów musi być różna od zera';
  END IF;
  IF p_powod NOT IN ('nadanie_admin', 'zakup', 'korekta', 'pakiet_startowy') THEN
    RAISE EXCEPTION 'grant_sms_credits: niedozwolony powód %', p_powod;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM service_providers WHERE id = p_provider_id) THEN
    RAISE EXCEPTION 'grant_sms_credits: nie ma warsztatu %', p_provider_id;
  END IF;

  SELECT id INTO v_sms FROM billing_features WHERE key = 'sms';
  IF v_sms IS NULL THEN
    RAISE EXCEPTION 'grant_sms_credits: brak cechy sms w billing_features';
  END IF;

  IF p_ile > 0 THEN
    INSERT INTO billing_addon_packs
      (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
       expires_at, source, note)
    VALUES ('service_provider', p_provider_id, v_sms, p_ile, p_ile,
            NULL,
            CASE WHEN p_powod = 'zakup' THEN 'purchase' ELSE 'admin_grant' END,
            COALESCE(p_opis, 'Nadanie: ' || p_powod));
  ELSE
    -- Korekta w dół zdejmuje z paczek tą samą drogą co zwykłe zużycie,
    -- zamiast obniżać licznik, którego nikt nie czyta.
    v_wynik := public.billing_consume('service_provider', p_provider_id, 'sms', abs(p_ile), false);
    IF COALESCE((v_wynik ->> 'ok')::boolean, false) = false THEN
      RAISE EXCEPTION 'grant_sms_credits: nie da się zdjąć % SMS — %', abs(p_ile), v_wynik ->> 'reason';
    END IF;
  END IF;

  INSERT INTO sms_credit_ledger (provider_id, delta, powod, actor_user_id, opis)
  VALUES (p_provider_id, p_ile, p_powod, p_actor, p_opis);

  -- Zwracamy to, co klient realnie może wysłać — nie stan martwej kolumny.
  RETURN COALESCE(public.sms_dostepne(p_provider_id), 2147483647)::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_sms_credits(uuid, integer, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.grant_sms_credits(uuid, integer, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Panel administratora pokazuje realną dostępność
-- ---------------------------------------------------------------------------
-- DROP przed CREATE: zmieniamy NAZWĘ kolumny w zwracanej tabeli
-- (`sms_balance` → `sms_dostepne`), a `CREATE OR REPLACE FUNCTION` nie potrafi
-- zmienić typu zwracanego. Padło na produkcji przy pierwszym uruchomieniu.
DROP FUNCTION IF EXISTS public.admin_list_service_providers();

CREATE FUNCTION public.admin_list_service_providers()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  owner_email text,
  company_name text,
  company_nip text,
  company_address text,
  company_city text,
  company_phone text,
  sms_dostepne integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
    SELECT sp.id, sp.user_id, sp.owner_email, sp.company_name, sp.company_nip,
           sp.company_address, sp.company_city, sp.company_phone,
           -- NULL z `sms_dostepne` znaczy „plan bez limitu"; w tabeli
           -- administratora pokazujemy wtedy zero zamiast myślnika, bo
           -- kolumna jest liczbowa. Interfejs i tak nie ma dziś takiego planu.
           COALESCE(public.sms_dostepne(sp.id), 0)::int
    FROM public.service_providers sp
    ORDER BY sp.company_name NULLS LAST
    LIMIT 1000;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Strażnik martwej kolumny i sama kolumna
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_guard_sms_balance ON public.service_providers;
DROP FUNCTION IF EXISTS public.guard_sms_balance();

-- Widok kontrolny porównywał `sms_balance` z sumą księgi. Po usunięciu kolumny
-- pytanie brzmi tak samo — „czy księga opisuje to, co klient może wysłać" —
-- tylko lewa strona równania to teraz realna dostępność: pula planu i paczki.
-- DROP przed CREATE: `CREATE OR REPLACE VIEW` nie potrafi zmienić NAZWY
-- kolumny (`saldo` → `dostepne`), a zmiana nazwy jest tu celowa: nowa
-- kolumna znaczy co innego niż stara i nie chcę, żeby ktoś czytał ją jak
-- dawne saldo.
DROP VIEW IF EXISTS public.sms_saldo_kontrola;
CREATE VIEW public.sms_saldo_kontrola AS
SELECT sp.id AS provider_id,
       sp.company_name,
       COALESCE(public.sms_dostepne(sp.id), 0)::integer AS dostepne,
       COALESCE(SUM(l.delta), 0)::integer               AS suma_ksiegi,
       COALESCE(public.sms_dostepne(sp.id), 0)::integer
         - COALESCE(SUM(l.delta), 0)::integer           AS roznica
FROM public.service_providers sp
LEFT JOIN public.sms_credit_ledger l ON l.provider_id = sp.id
GROUP BY sp.id, sp.company_name;

REVOKE ALL ON public.sms_saldo_kontrola FROM anon, authenticated;

ALTER TABLE public.service_providers DROP COLUMN IF EXISTS sms_balance;

-- ---------------------------------------------------------------------------
-- 4. Kanoniczna postać adresu e-mail
-- ---------------------------------------------------------------------------
-- Powód (audyt 16.08): z jednej skrzynki Gmail dało się wziąć PIĘĆ pakietów
-- startowych. Wielkość liter i spacje były obcinane, ale nie plus-adresowanie
-- (`daniel+cokolwiek@`), nie kropki w Gmailu (`d.a.n.i.e.l@` to ten sam adres)
-- i nie alias `googlemail.com`. Przy 30 SMS + 5 VIN to 72,50 zł z jednego
-- adresu, powtarzalne bez końca.
--
-- Kropki usuwamy WYŁĄCZNIE dla domen Google — to ich reguła, nie standard.
-- W większości domen `jan.kowalski@` i `jankowalski@` to dwie różne osoby
-- i sklejenie ich odebrałoby pakiet komuś uczciwemu.
CREATE OR REPLACE FUNCTION public.normalizuj_email(p_email text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v      text := lower(btrim(COALESCE(p_email, '')));
  v_lokal text;
  v_dom   text;
BEGIN
  IF v = '' OR position('@' in v) = 0 THEN
    RETURN v;
  END IF;

  v_lokal := split_part(v, '@', 1);
  v_dom   := split_part(v, '@', 2);

  -- Plus-adresowanie: wszystko po `+` jest etykietą, nie adresem.
  -- Obsługują je Gmail, Outlook, Fastmail, Proton i większość serwerów.
  v_lokal := split_part(v_lokal, '+', 1);

  IF v_dom IN ('gmail.com', 'googlemail.com') THEN
    v_lokal := replace(v_lokal, '.', '');
    v_dom   := 'gmail.com';
  END IF;

  -- Pusta część lokalna (np. „+cos@gmail.com") nie jest adresem — oddajemy
  -- wejście bez zmian, żeby nie skleić wszystkich takich w jeden klucz.
  IF v_lokal = '' THEN
    RETURN v;
  END IF;

  RETURN v_lokal || '@' || v_dom;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Pakiet startowy rozpoznaje adres w postaci kanonicznej
-- ---------------------------------------------------------------------------
-- Istniejące wiersze też normalizujemy — inaczej klucz zmieniłby znaczenie
-- w połowie tabeli. Gdyby normalizacja skleiła dwa wiersze w jeden, zostawiamy
-- NAJSTARSZY: to on odpowiada pakietowi, który klient faktycznie dostał.
-- Rozstrzygnięcie MUSI być deterministyczne. Pierwsza wersja porównywała same
-- `created_at` i przy identycznym znaczniku czasu (wiersze z jednej transakcji,
-- albo NULL) nie usuwała żadnego z pary — a następny UPDATE łamał się na kluczu
-- głównym. Wyszło na uruchomieniu, nie w przeglądzie.
DELETE FROM public.pakiety_startowe p
WHERE EXISTS (
  SELECT 1 FROM public.pakiety_startowe q
  WHERE public.normalizuj_email(q.email) = public.normalizuj_email(p.email)
    AND q.email <> p.email
    AND (COALESCE(q.przyznany_at, '-infinity'::timestamptz), q.email)
      < (COALESCE(p.przyznany_at, '-infinity'::timestamptz), p.email)
);

UPDATE public.pakiety_startowe
SET email = public.normalizuj_email(email)
WHERE email <> public.normalizuj_email(email);

CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id     uuid,
  p_provider_id uuid,
  p_email       text,
  p_sms         integer DEFAULT 30,
  p_vin         integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := public.normalizuj_email(p_email);
BEGIN
  IF v_email = '' OR p_provider_id IS NULL THEN
    RAISE WARNING 'przyznaj_pakiet_startowy: brak adresu albo warsztatu — pomijam';
    RETURN false;
  END IF;

  INSERT INTO pakiety_startowe (email, user_id, provider_id, sms, vin)
  VALUES (v_email, p_user_id, p_provider_id, p_sms, p_vin)
  ON CONFLICT (email) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Pakiet trafia do PACZEK warsztatu (patrz 4.12): stare salda są martwe,
  -- a wysyłka i sprawdzenia czytają pulę planu i paczki.
  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_sms, p_sms,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'sms' AND p_sms > 0;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_vin, p_vin,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'vehicle_lookup' AND p_vin > 0;

  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
  VALUES (p_provider_id, p_sms, 'pakiet_startowy', 'Pakiet startowy przy rejestracji');

  RAISE NOTICE 'Pakiet startowy dla % : % SMS, % VIN', v_email, p_sms, p_vin;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.normalizuj_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.normalizuj_email(text) TO service_role, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

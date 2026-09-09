-- Pakiet startowy: 50 SMS (bez zmian), VIN 5 → 10, Rido AI ZOSTAJE 50.
--
-- ⚠️ TEN PLIK ZOSTAŁ PRZEPISANY 09.09.2026 PO DECYZJI. Nazwa mówi „100_ai",
-- bo taka była pierwsza wersja — Rido AI zostaje na 50. Nazwy nie zmieniam,
-- żeby nie zrobić drugiego pliku o tej samej treści; plik NIE BYŁ WYKONANY,
-- więc edycja nie łamie zasady „nie ruszaj wykonanych migracji".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO VIN TAK, A RIDO AI NIE
-- ═══════════════════════════════════════════════════════════════════════════
-- Przy pięciu sprawdzeniach warsztat sprawdza trzy auta i kończy — nie zdąży
-- poczuć, do czego to służy. Dziesięć to około tygodnia normalnej pracy,
-- a sprawdzenie kosztuje grosze.
--
-- Rido AI kosztuje inaczej. Sto zapytań to ~26 zł na konto przy typowym
-- rozkładzie i ~102 zł, gdy klient robi same analizy (Sonnet + wyszukiwanie
-- w sieci). Przy stu rejestracjach, z których połowa nigdy nie zapłaci,
-- to więcej niż SMS-y i VIN razem wzięte. Zostaje 50.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 PULA PLANÓW PRÓBNYCH SCHODZI DO ZERA — I TO JEST WŁAŚCIWA NAPRAWA
-- ═══════════════════════════════════════════════════════════════════════════
-- Rido AI ma DZIŚ DWA ŹRÓDŁA startowe i to jest usterka, nie zamiar:
--
--   1. `przyznaj_pakiet_startowy` (przy rejestracji)          → 50
--   2. `przyznaj_start_rido_ai` z `billing_plans.rido_ai_start_ile`
--      dla planu próbnego, wyzwalaczem z `20260823140000`     → 50
--
-- Zmierzone na produkcji: z siedemnastu warsztatów z pakietem startowym DRUGĄ
-- pulę dostały TRZY — te, których wiersz subskrypcji powstał już po wyzwalaczu.
-- Jedni mają 50, inni 100, za to samo. Rozjazd jest gorszy niż sama liczba.
--
-- Plany PŁATNE (`warsztat_standard` 20, `warsztat_pro` 50) zostają NIETKNIĘTE.
-- Tam pula startowa znaczy co innego: to powitanie przy wejściu w płatny plan,
-- a nie prezent rejestracyjny, i nie nakłada się na pakiet startowy.
--
-- ⚠️ TRZY KONTA ZOSTAJĄ ZE 100 — świadomie. `daniel.m@car4ride.pl`,
-- `sofiazhovtaugc@gmail.com` i `marcin.suchlabowicz@gmail.com` zdążyły dostać
-- obie pule. Nikomu nic nie odbieramy; od tej migracji nowe konta dostają 50.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO Z TYM, CO JUŻ NADANO — trzy pytania z CLAUDE.md
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ILE WIERSZY POWSTAŁO PO STAREMU? Policzone: 17 paczek VIN po 5 sztuk,
--    16 paczek Rido AI (13 po 50 + 3 konta z drugą pulą), 18 kont łącznie.
--
-- 2. NAPRAWIAMY CZY ZOSTAWIAMY? Nowa oferta obejmuje WYŁĄCZNIE konta zakładane
--    od teraz. Starym kontom nie podmieniamy nic — z dwoma wyjątkami:
--
--      BLOK A — 13 kont audytowych. Mają służyć do przechodzenia ścieżki
--               w przeglądarce, więc muszą pokazywać to, co zobaczy klient.
--      BLOK B — `karolrzepko@go2.pl` (CART78). Jedyne konto z realnym użyciem,
--               testuje świadomie i ma dostać to samo, co dostanie klient.
--
-- 3. CO, GDY STAN ZDĄŻYŁ SIĘ ZMIENIĆ? Blok A ma kontrolę wstępną, która
--    zatrzymuje migrację, gdy z paczki cokolwiek zeszło — wyrównanie ustawia
--    `amount_remaining = amount_total` i przy zużytych sztukach oddałoby
--    klientowi to, co już wykorzystał. Blok B liczy OD STANU FAKTYCZNEGO
--    (Karol ma 2 SMS-y zużyte), więc dokłada RÓŻNICĘ i niczego mu nie zabiera.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. NOWE WARTOŚCI DOMYŚLNE
-- ---------------------------------------------------------------------------
-- `register-marketplace-user` i `activate-workshop-trial` wołają tę funkcję
-- BEZ podawania liczb — świadomie, żeby zmiana pakietu nie wymagała wdrożenia
-- dwóch funkcji brzegowych. Dlatego wystarczy tu.
CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id     uuid,
  p_provider_id uuid,
  p_email       text,
  p_sms         integer DEFAULT 50,
  p_vin         integer DEFAULT 10,
  p_rido_ai     integer DEFAULT 50
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
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

  -- ⬇ PACZKI SMS NIE ZAKŁADAMY TUTAJ.
  --
  -- Stał tu `INSERT INTO billing_addon_packs` dla SMS-ów, a niżej stoi
  -- `grant_sms_credits` — i to ona OD 19 SIERPNIA też zakłada paczkę.
  -- Każde nowe konto dostawało DWIE paczki, a księga notowała jedną.
  -- Zostaje `grant_sms_credits`: pisze paczkę I wiersz księgi w jednej
  -- transakcji, więc jedno źródło zamiast dwóch rozjeżdżających się.

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_vin, p_vin,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'vehicle_lookup' AND p_vin > 0;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_rido_ai, p_rido_ai,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'rido_ai' AND p_rido_ai > 0;

  -- Ślad w księdze SMS zostaje, bo to ona odpowiada na pytanie „skąd to saldo".
  PERFORM public.grant_sms_credits(p_provider_id, p_sms, 'pakiet_startowy')
  WHERE p_sms > 0;

  RETURN true;
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. KONIEC DRUGIEJ PULI RIDO AI PRZY PLANIE PRÓBNYM
-- ---------------------------------------------------------------------------
-- Wymienione z nazwy, nie wzorcem po `trial%`: wzorzec objąłby każdy przyszły
-- plan z tym przedrostkiem, a ta zmiana ma dotyczyć dokładnie tych dwóch.
UPDATE public.billing_plans
SET rido_ai_start_ile = 0
WHERE code IN ('trial_warsztat', 'trial_max');

-- ---------------------------------------------------------------------------
-- BLOK A — 13 kont audytowych
-- ---------------------------------------------------------------------------
-- Adresy wypisane WPROST, nie wzorcem po `%audyt%`: wzorzec objąłby każde
-- przyszłe konto z tym słowem w adresie.
CREATE TEMP TABLE cele_audyt ON COMMIT DROP AS
SELECT sp.id AS provider_id, u.email
FROM auth.users u
JOIN service_providers sp ON sp.user_id = u.id
WHERE u.email IN (
  'audyt.rido.sciezka@gmail.com',
  'rido.audyt.s1@gmail.com',  'rido.audyt.s2@gmail.com',  'rido.audyt.s3@gmail.com',
  'rido.audyt.s4@gmail.com',  'rido.audyt.s5@gmail.com',  'rido.audyt.s6@gmail.com',
  'rido.audyt.s7@gmail.com',  'rido.audyt.s8@gmail.com',  'rido.audyt.s9@gmail.com',
  'rido.audyt.s10@gmail.com',
  'rido.audyt.wdrozenie1@gmail.com', 'rido.audyt.wdrozenie2@gmail.com'
);

DO $KONTROLA_A$
DECLARE
  v_vin uuid := (SELECT id FROM billing_features WHERE key = 'vehicle_lookup');
  v_ile int;
  v_zle text;
BEGIN
  IF v_vin IS NULL THEN
    RAISE EXCEPTION 'Brak cechy vehicle_lookup — nie ma czego wyrownywac';
  END IF;

  SELECT count(*) INTO v_ile FROM cele_audyt;
  IF v_ile <> 13 THEN
    RAISE EXCEPTION 'Spodziewalem sie 13 kont audytowych, znalazlem %. Nie wyrownuje w ciemno.', v_ile;
  END IF;

  -- ZUŻYTA SZTUKA ZATRZYMUJE BLOK A. Wyrównanie ustawia
  -- `amount_remaining = amount_total`; przy częściowo zużytej paczce oddałoby
  -- sztuki, które już zeszły.
  SELECT string_agg(email || ' (VIN ' || opis || ')', ', ') INTO v_zle
  FROM (
    SELECT c.email,
           coalesce(sum(p.amount_remaining), 0)::text || '/' ||
           coalesce(sum(p.amount_total), 0)::text AS opis
    FROM cele_audyt c
    LEFT JOIN billing_addon_packs p
      ON p.subscriber_id = c.provider_id AND p.source = 'admin_grant' AND p.feature_id = v_vin
    GROUP BY c.email
    HAVING coalesce(sum(p.amount_remaining), 0) <> coalesce(sum(p.amount_total), 0)
  ) t;

  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'Z pakietu startowego juz cos zeszlo — %', v_zle;
  END IF;
END $KONTROLA_A$;

-- Rido AI kont audytowych ZOSTAJE na 50 — nowa wartość jest równa starej,
-- więc nie ma czego ruszać. Zmienia się wyłącznie VIN.
UPDATE billing_addon_packs p
SET amount_total = 10, amount_remaining = 10
FROM cele_audyt c
WHERE p.subscriber_id = c.provider_id
  AND p.source = 'admin_grant'
  AND p.feature_id = (SELECT id FROM billing_features WHERE key = 'vehicle_lookup')
  AND p.amount_total < 10;

UPDATE pakiety_startowe ps
SET vin = 10
FROM cele_audyt c
WHERE ps.provider_id = c.provider_id AND ps.vin < 10;

-- ---------------------------------------------------------------------------
-- BLOK B — karolrzepko@go2.pl, LICZONY OD STANU FAKTYCZNEGO
-- ---------------------------------------------------------------------------
-- Konto nosi STARY pakiet: 30 SMS (2 zużyte, 28 zostało), 5 VIN, ZERO Rido AI.
-- Ma dostać dzisiejszy standard 50 / 10 / 50, ale bez oddawania mu zużytych
-- sztuk. Dlatego SMS-y dostają RÓŻNICĘ do sumy nadanej (30 → 50, czyli +20
-- i do sumy, i do reszty), a nie sztywne przypisanie.
--
-- To jest osobny blok właśnie dlatego, że kontrola bloku A odmówiłaby: tam
-- „zużyte sztuki" znaczą „nie wiem, co zastałem", tu znaczą „wiem dokładnie".
DO $BLOK_B$
DECLARE
  v_pid   uuid;
  v_sms   uuid := (SELECT id FROM billing_features WHERE key = 'sms');
  v_vin   uuid := (SELECT id FROM billing_features WHERE key = 'vehicle_lookup');
  v_ai    uuid := (SELECT id FROM billing_features WHERE key = 'rido_ai');
  v_nadane   numeric;
  v_zostalo  numeric;
  v_ksiega   numeric;
  v_roznica  numeric;
BEGIN
  SELECT sp.id INTO v_pid
  FROM auth.users u JOIN service_providers sp ON sp.user_id = u.id
  WHERE u.email = 'karolrzepko@go2.pl';

  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'Nie znalazlem warsztatu dla karolrzepko@go2.pl';
  END IF;

  -- ── SMS: dokładamy różnicę do 50 nadanych ──
  SELECT coalesce(sum(amount_total), 0), coalesce(sum(amount_remaining), 0)
    INTO v_nadane, v_zostalo
  FROM billing_addon_packs
  WHERE subscriber_id = v_pid AND source = 'admin_grant' AND feature_id = v_sms;

  SELECT coalesce(sum(delta), 0) INTO v_ksiega
  FROM sms_credit_ledger WHERE provider_id = v_pid;

  -- Księga i paczki muszą mówić to samo, zanim cokolwiek dołożymy. Rozjazd
  -- znaczy, że nie wiem, od czego liczyć — a wtedy migracja ma stanąć.
  IF v_ksiega <> v_zostalo THEN
    RAISE EXCEPTION 'Ksiega SMS (%) nie zgadza sie z reszta paczek (%) — nie wyrownuje', v_ksiega, v_zostalo;
  END IF;

  v_roznica := 50 - v_nadane;
  IF v_roznica < 0 THEN
    RAISE EXCEPTION 'Konto ma juz % nadanych SMS-ow, wiecej niz 50 — nie zabieram', v_nadane;
  END IF;

  IF v_roznica > 0 THEN
    -- Podnosimy JEDNĄ paczkę (najstarszą), żeby suma nadana wyszła 50,
    -- a reszta urosła o tyle samo. Zużyte 2 sztuki zostają zużyte.
    UPDATE billing_addon_packs
    SET amount_total = amount_total + v_roznica,
        amount_remaining = amount_remaining + v_roznica
    WHERE id = (
      SELECT id FROM billing_addon_packs
      WHERE subscriber_id = v_pid AND source = 'admin_grant' AND feature_id = v_sms
      ORDER BY created_at LIMIT 1
    );

    -- Księga notuje RÓŻNICĘ, nie nową sumę: odpowiada na pytanie „skąd wzięło
    -- się to, co masz", a nie „ile masz".
    INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
    VALUES (v_pid, v_roznica::int, 'wyrownanie',
            'Wyrownanie do pakietu startowego 50 SMS (bylo ' || v_nadane || ')');
  END IF;

  -- ── VIN: 5 → 10, nic nie zuzyte, wiec proste podniesienie ──
  UPDATE billing_addon_packs
  SET amount_total = 10, amount_remaining = amount_remaining + (10 - amount_total)
  WHERE subscriber_id = v_pid AND source = 'admin_grant'
    AND feature_id = v_vin AND amount_total < 10;

  -- ── Rido AI: paczki nie ma, wiec zakladamy ──
  IF NOT EXISTS (
    SELECT 1 FROM billing_addon_packs
    WHERE subscriber_id = v_pid AND source = 'admin_grant' AND feature_id = v_ai
  ) THEN
    INSERT INTO billing_addon_packs
      (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
       expires_at, source, note)
    VALUES ('service_provider', v_pid, v_ai, 50, 50, NULL, 'admin_grant',
            'Wyrownanie do pakietu startowego');
  END IF;

  -- Rejestr ma mowic to samo co paczki.
  UPDATE pakiety_startowe SET sms = 50, vin = 10 WHERE provider_id = v_pid;
END $BLOK_B$;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — osobno funkcja, osobno DANE
-- ---------------------------------------------------------------------------
-- Kontrola sprawdzająca TREŚĆ FUNKCJI nie jest kontrolą DANYCH. Potrzebne obie:
-- migracja `20260823120000` naprawiła funkcję i wyszła na zielono nad
-- jedenastoma kontami, których nie tknęła.
DO $KONIEC$
DECLARE
  v_args text;
  v_zle  text;
  v_plan int;
  v_pid  uuid;
  v_sms_nadane numeric; v_sms_zostalo numeric; v_ksiega numeric;
  v_vin_nadane numeric; v_ai_nadane numeric;
BEGIN
  -- (a) FUNKCJA: nowe wartosci domyslne naprawde tam sa.
  -- `p.oid` z nazwa tabeli, nie samo `oid`: przy zlaczeniu z `pg_namespace`
  -- obie tabele maja kolumne `oid` i Postgres odmawia. Parser tego nie widzi.
  v_args := pg_get_function_arguments(
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'przyznaj_pakiet_startowy'));
  IF v_args NOT LIKE '%p_sms integer DEFAULT 50%'
     OR v_args NOT LIKE '%p_vin integer DEFAULT 10%'
     OR v_args NOT LIKE '%p_rido_ai integer DEFAULT 50%' THEN
    RAISE EXCEPTION 'Wartosci domyslne pakietu startowego sie nie zgadzaja — %', v_args;
  END IF;

  -- (b) FUNKCJA: nie wrocilo podwojne zakladanie paczki SMS.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy')
     NOT LIKE '%grant_sms_credits%' THEN
    RAISE EXCEPTION 'pakiet startowy przestal zapisywac ksiege SMS';
  END IF;

  -- (c) PLANY: pula probnych wyzerowana, platne nietkniete.
  SELECT count(*) INTO v_plan FROM billing_plans
  WHERE code IN ('trial_warsztat', 'trial_max') AND coalesce(rido_ai_start_ile, 0) <> 0;
  IF v_plan <> 0 THEN
    RAISE EXCEPTION 'Plan probny nadal ma wlasna pule Rido AI — bylyby dwa zrodla';
  END IF;
  SELECT count(*) INTO v_plan FROM billing_plans
  WHERE code = 'warsztat_pro' AND coalesce(rido_ai_start_ile, 0) = 50;
  IF v_plan <> 1 THEN
    RAISE EXCEPTION 'Ruszona zostala pula planu platnego — a miala zostac nietknieta';
  END IF;

  -- (d) BLOK A: kazde konto audytowe ma 10 VIN i 50 Rido AI, nic nie zuzyte.
  SELECT string_agg(email || ' → ' || opis, '; ') INTO v_zle
  FROM (
    SELECT c.email,
           'VIN ' || coalesce(sum(p.amount_total) FILTER (
                       WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='vehicle_lookup')), 0)::text ||
           ', AI ' || coalesce(sum(p.amount_total) FILTER (
                       WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='rido_ai')), 0)::text AS opis
    FROM cele_audyt c
    LEFT JOIN billing_addon_packs p
      ON p.subscriber_id = c.provider_id AND p.source = 'admin_grant'
    GROUP BY c.email
    HAVING coalesce(sum(p.amount_total) FILTER (
             WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='vehicle_lookup')), 0) <> 10
        OR coalesce(sum(p.amount_total) FILTER (
             WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='rido_ai')), 0) <> 50
  ) t;
  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'Blok A nie doszedl do skutku: %', v_zle;
  END IF;

  -- (e) BLOK B: Karol ma 50 nadanych SMS przy 48 pozostalych (2 zuzyte
  --     ZOSTAJA zuzyte), 10 VIN, 50 Rido AI, a ksiega zgadza sie z reszta.
  SELECT sp.id INTO v_pid FROM auth.users u
  JOIN service_providers sp ON sp.user_id = u.id WHERE u.email = 'karolrzepko@go2.pl';

  SELECT coalesce(sum(amount_total) FILTER (WHERE feature_id = (SELECT id FROM billing_features WHERE key='sms')), 0),
         coalesce(sum(amount_remaining) FILTER (WHERE feature_id = (SELECT id FROM billing_features WHERE key='sms')), 0),
         coalesce(sum(amount_total) FILTER (WHERE feature_id = (SELECT id FROM billing_features WHERE key='vehicle_lookup')), 0),
         coalesce(sum(amount_total) FILTER (WHERE feature_id = (SELECT id FROM billing_features WHERE key='rido_ai')), 0)
    INTO v_sms_nadane, v_sms_zostalo, v_vin_nadane, v_ai_nadane
  FROM billing_addon_packs WHERE subscriber_id = v_pid AND source = 'admin_grant';

  SELECT coalesce(sum(delta), 0) INTO v_ksiega FROM sms_credit_ledger WHERE provider_id = v_pid;

  IF v_sms_nadane <> 50 OR v_vin_nadane <> 10 OR v_ai_nadane <> 50 THEN
    RAISE EXCEPTION 'Karol: SMS %, VIN %, AI % — mialo byc 50/10/50',
      v_sms_nadane, v_vin_nadane, v_ai_nadane;
  END IF;
  IF v_sms_zostalo <> 48 THEN
    RAISE EXCEPTION 'Karol: zostalo % SMS-ow, a mialo 48 (50 nadanych minus 2 zuzyte)', v_sms_zostalo;
  END IF;
  IF v_ksiega <> v_sms_zostalo THEN
    RAISE EXCEPTION 'Karol: ksiega (%) rozjechala sie z reszta paczek (%)', v_ksiega, v_sms_zostalo;
  END IF;

  RAISE NOTICE 'Pakiet startowy: 50 SMS, 10 VIN, 50 Rido AI. Blok A (13 kont) i Karol wyrownani, pula planow probnych wyzerowana.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

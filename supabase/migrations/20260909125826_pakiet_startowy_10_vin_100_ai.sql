-- Pakiet startowy: 50 SMS (bez zmian), VIN 5 → 10, Rido AI 50 → 100.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO 10 VIN
-- ═══════════════════════════════════════════════════════════════════════════
-- Przy pięciu sprawdzeniach warsztat sprawdza trzy auta i kończy — nie zdąży
-- poczuć, do czego to służy. Dziesięć to około tygodnia normalnej pracy.
-- Koszt: sprawdzenie idzie do zewnętrznego dostawcy, więc pięć sztuk więcej
-- na konto jest wobec abonamentu 99–169 zł nieistotne.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 DLACZEGO PRZY OKAZJI ZERUJEMY PULĘ PLANÓW PRÓBNYCH
-- ═══════════════════════════════════════════════════════════════════════════
-- Rido AI ma DZIŚ DWA ŹRÓDŁA startowe i to jest usterka, nie zamiar:
--
--   1. `przyznaj_pakiet_startowy` (przy rejestracji)          → 50
--   2. `przyznaj_start_rido_ai` z `billing_plans.rido_ai_start_ile`
--      dla planu próbnego, wyzwalaczem z `20260823140000`     → 50
--
-- Zmierzone na produkcji: z siedemnastu warsztatów z pakietem startowym
-- DRUGĄ pulę dostały TRZY (daniel.m@car4ride.pl, marcin.suchlabowicz@gmail.com,
-- sofiazhovtaugc@gmail.com) — te, których wiersz subskrypcji powstał już po
-- wyzwalaczu. Czyli jedni mają 50, inni 100, za to samo.
--
-- Samo podniesienie pakietu do 100 pogłębiłoby rozjazd: część kont dostałaby
-- 150. Dlatego pula startowa planów PRÓBNYCH schodzi do zera, a całe 100
-- siedzi w jednym miejscu — w pakiecie startowym.
--
-- Plany PŁATNE (`warsztat_standard` 20, `warsztat_pro` 50) zostają NIETKNIĘTE.
-- Tam pula startowa znaczy co innego: to powitanie przy wejściu w płatny plan,
-- a nie prezent rejestracyjny, i nie nakłada się na pakiet startowy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO Z TYM, CO JUŻ NADANO — trzy pytania z CLAUDE.md
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ILE WIERSZY POWSTAŁO PO STAREMU? Policzone, nie oszacowane:
--    17 paczek VIN po 5 sztuk, 16 paczek Rido AI po 50 (+3 paczki „z planu”),
--    18 kont łącznie.
--
-- 2. NAPRAWIAMY CZY ZOSTAWIAMY? Naprawiamy — w DWÓCH ROZDZIELNYCH BLOKACH:
--
--      BLOK A — konta audytowe/testowe (13 sztuk, `audyt.*`/`rido.audyt.*`).
--      BLOK B — konta w okresie próbnym z nietkniętym pakietem
--               (`daniel.m@car4ride.pl`, `sofiazhovtaugc@gmail.com`,
--               `marcin.suchlabowicz@gmail.com`).
--
--    ⚠️ BLOK B DAJE WIĘCEJ PRAWDZIWYM KLIENTOM. Jeśli nowa oferta ma objąć
--    wyłącznie konta zakładane OD TERAZ, usuń blok B przed wykonaniem —
--    reszta migracji jest od niego niezależna. Zostawienie ich na 5 VIN znaczy,
--    że trzy konta w okresie próbnym mają mniej, niż obiecuje cennik.
--
--    ŚWIADOMIE POMIJAMY `karolrzepko@go2.pl` (CART78, prawdziwy klient):
--    nosi STARY pakiet 30 SMS, ma z niego 2 sztuki zużyte i nie ma paczki
--    Rido AI w ogóle. Wyrównanie go to osobna decyzja — czy dostaje też
--    podniesienie SMS-ów z 30 do 50 — a nie skutek uboczny tej migracji.
--    `warsztat@test.pl` nie ma pakietu startowego, więc nie ma czego ruszać.
--
-- 3. CO, GDY STAN ZDĄŻYŁ SIĘ ZMIENIĆ? Kontrola wstępna zatrzymuje migrację,
--    gdy z którejkolwiek ruszanej paczki cokolwiek zeszło. Wyrównanie zna stan,
--    który zastaje; przy zużytych sztukach `amount_remaining = amount_total`
--    zabrałoby klientowi to, co już wykorzystał.

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
  p_rido_ai     integer DEFAULT 100
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
-- KONTROLA WSTĘPNA — zanim ruszymy czyjekolwiek salda
-- ---------------------------------------------------------------------------
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

-- BLOK B — usuń tę tabelę i sekcję oznaczoną „BLOK B", jeśli prawdziwi klienci
-- w okresie próbnym mają zostać na starym pakiecie.
CREATE TEMP TABLE cele_probne ON COMMIT DROP AS
SELECT sp.id AS provider_id, u.email
FROM auth.users u
JOIN service_providers sp ON sp.user_id = u.id
WHERE u.email IN (
  'daniel.m@car4ride.pl',
  'sofiazhovtaugc@gmail.com',
  'marcin.suchlabowicz@gmail.com'
);

CREATE TEMP TABLE cele_wszystkie ON COMMIT DROP AS
SELECT * FROM cele_audyt UNION SELECT * FROM cele_probne;

DO $KONTROLA$
DECLARE
  v_vin   uuid := (SELECT id FROM billing_features WHERE key = 'vehicle_lookup');
  v_ai    uuid := (SELECT id FROM billing_features WHERE key = 'rido_ai');
  v_audyt int;
  v_zle   text;
BEGIN
  IF v_vin IS NULL OR v_ai IS NULL THEN
    RAISE EXCEPTION 'Brak cechy vehicle_lookup albo rido_ai — nie ma czego wyrównywać';
  END IF;

  SELECT count(*) INTO v_audyt FROM cele_audyt;
  IF v_audyt <> 13 THEN
    RAISE EXCEPTION 'Spodziewalem sie 13 kont audytowych, znalazlem %. Nie wyrownuje w ciemno.', v_audyt;
  END IF;

  -- ZUŻYTA SZTUKA ZATRZYMUJE MIGRACJĘ. Wyrównanie ustawia
  -- `amount_remaining = amount_total`; przy częściowo zużytej paczce oddałoby
  -- klientowi sztuki, które już wykorzystał, albo — przy innym stanie —
  -- zabrało mu je. Kontrola ma stanąć, a nie „poradzić sobie" arytmetyką.
  SELECT string_agg(email || ' (' || opis || ')', ', ') INTO v_zle
  FROM (
    SELECT c.email,
           'VIN ' || coalesce(sum(p.amount_remaining) FILTER (WHERE p.feature_id = v_vin), 0)::text ||
           '/'    || coalesce(sum(p.amount_total)     FILTER (WHERE p.feature_id = v_vin), 0)::text ||
           ', AI '|| coalesce(sum(p.amount_remaining) FILTER (WHERE p.feature_id = v_ai), 0)::text ||
           '/'    || coalesce(sum(p.amount_total)     FILTER (WHERE p.feature_id = v_ai), 0)::text AS opis
    FROM cele_wszystkie c
    LEFT JOIN billing_addon_packs p
      ON p.subscriber_id = c.provider_id
     AND p.source = 'admin_grant'
     AND p.feature_id IN (v_vin, v_ai)
    GROUP BY c.email
    HAVING coalesce(sum(p.amount_remaining) FILTER (WHERE p.feature_id = v_vin), 0)
        <> coalesce(sum(p.amount_total)     FILTER (WHERE p.feature_id = v_vin), 0)
        OR coalesce(sum(p.amount_remaining) FILTER (WHERE p.feature_id = v_ai), 0)
        <> coalesce(sum(p.amount_total)     FILTER (WHERE p.feature_id = v_ai), 0)
  ) t;

  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'Z pakietu startowego juz cos zeszlo — %', v_zle;
  END IF;
END $KONTROLA$;

-- ---------------------------------------------------------------------------
-- 3. WYRÓWNANIE — BLOK A (konta audytowe) i BLOK B (okres próbny)
-- ---------------------------------------------------------------------------
-- Obie paczki podnosimy tym samym zapytaniem po `cele_wszystkie`. Usunięcie
-- `cele_probne` wyżej zawęża je do bloku A bez ruszania niczego tutaj.

-- VIN: 5 → 10.
UPDATE billing_addon_packs p
SET amount_total = 10, amount_remaining = 10
FROM cele_wszystkie c
WHERE p.subscriber_id = c.provider_id
  AND p.source = 'admin_grant'
  AND p.feature_id = (SELECT id FROM billing_features WHERE key = 'vehicle_lookup')
  AND p.amount_total < 10;

-- Rido AI: paczka rejestracyjna rośnie tak, żeby SUMA startowa wyszła 100.
-- Konta z dwiema paczkami po 50 mają już 100 — tych nie ruszamy, bo cel jest
-- osiągnięty, a podniesienie dałoby im 150.
UPDATE billing_addon_packs p
SET amount_total = 100, amount_remaining = 100
FROM cele_wszystkie c
WHERE p.subscriber_id = c.provider_id
  AND p.source = 'admin_grant'
  AND p.feature_id = (SELECT id FROM billing_features WHERE key = 'rido_ai')
  AND p.note = 'Pakiet startowy przy rejestracji'
  AND (
    SELECT coalesce(sum(q.amount_total), 0) FROM billing_addon_packs q
    WHERE q.subscriber_id = c.provider_id
      AND q.source = 'admin_grant'
      AND q.feature_id = p.feature_id
  ) < 100;

-- Rejestr pakietów startowych ma mówić to samo co paczki.
UPDATE pakiety_startowe ps
SET vin = 10
FROM cele_wszystkie c
WHERE ps.provider_id = c.provider_id AND ps.vin < 10;

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
BEGIN
  -- (a) FUNKCJA: nowe wartości domyślne naprawdę tam są.
  -- `p.oid` z nazwą tabeli, nie samo `oid`: przy złączeniu z `pg_namespace`
  -- obie tabele mają kolumnę `oid` i Postgres odmawia („column reference oid
  -- is ambiguous"). Parser składni tego nie widzi — wyszło przy wykonaniu.
  v_args := pg_get_function_arguments(
    (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'przyznaj_pakiet_startowy'));
  IF v_args NOT LIKE '%p_sms integer DEFAULT 50%'
     OR v_args NOT LIKE '%p_vin integer DEFAULT 10%'
     OR v_args NOT LIKE '%p_rido_ai integer DEFAULT 100%' THEN
    RAISE EXCEPTION 'Wartosci domyslne pakietu startowego sie nie zgadzaja — %', v_args;
  END IF;

  -- (b) FUNKCJA: nie wrocilo podwojne zakladanie paczki SMS.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy')
     NOT LIKE '%grant_sms_credits%' THEN
    RAISE EXCEPTION 'pakiet startowy przestal zapisywac ksiege SMS';
  END IF;

  -- (c) PLANY: pula startowa planow probnych wyzerowana, platne nietkniete.
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

  -- (d) DANE: kazde wyrownywane konto ma 10 VIN i 100 Rido AI, nic nie zuzyte.
  SELECT string_agg(email || ' → ' || opis, '; ') INTO v_zle
  FROM (
    SELECT c.email,
           'VIN ' || coalesce(sum(p.amount_total) FILTER (
                       WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='vehicle_lookup')), 0)::text ||
           ', AI ' || coalesce(sum(p.amount_total) FILTER (
                       WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='rido_ai')), 0)::text AS opis
    FROM cele_wszystkie c
    LEFT JOIN billing_addon_packs p
      ON p.subscriber_id = c.provider_id AND p.source = 'admin_grant'
    GROUP BY c.email
    HAVING coalesce(sum(p.amount_total) FILTER (
             WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='vehicle_lookup')), 0) <> 10
        OR coalesce(sum(p.amount_total) FILTER (
             WHERE p.feature_id = (SELECT id FROM billing_features WHERE key='rido_ai')), 0) <> 100
  ) t;

  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'Wyrownanie nie doszlo do skutku: %', v_zle;
  END IF;

  RAISE NOTICE 'Pakiet startowy: 50 SMS, 10 VIN, 100 Rido AI. Konta wyrownane, pula planow probnych wyzerowana.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

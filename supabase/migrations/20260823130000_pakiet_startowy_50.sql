-- Pakiet startowy: 30 → 50 SMS. VIN zostaje 5, Rido AI zostaje 50.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO 50
-- ═══════════════════════════════════════════════════════════════════════════
-- 30 SMS-ów to około dwóch tygodni pracy niewielkiego warsztatu. Klient ma
-- zdążyć poczuć, do czego to służy, ZANIM darmowe się skończą. Przy 0,20 zł
-- za sztukę koszt konta rośnie z 6 zł do 10 zł — nieistotnie wobec abonamentu
-- 99 albo 169 zł miesięcznie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZĘŚĆ DRUGA: WYRÓWNANIE JEDENASTU KONT TESTOWYCH
-- ═══════════════════════════════════════════════════════════════════════════
-- Poprzednia migracja (`20260823120000`) naprawiła FUNKCJĘ i naprawiła ją
-- skutecznie — sprawdzone zachowaniem, nie odczytem kodu: świeże wywołanie
-- zakłada dziś dokładnie JEDNĄ paczkę SMS, a suma paczek równa się księdze.
--
-- Czego ta migracja NIE zrobiła: nie tknęła kont założonych WCZEŚNIEJ.
-- Jedenaście kont audytowych powstało 23.08 między 12:46 a 12:53, czyli przed
-- jej uruchomieniem, i nosi po dwie paczki po 30 przy 30 w księdze. To nie
-- jest nawrót usterki, to nienaprawiona szkoda historyczna.
--
-- Zakres szkody poza tymi kontami: ŻADEN. Podwojenie zaczęło się 19.08 wraz
-- z naszą poprawką `grant_sms_credits`, a jedyne konta założone po tej dacie
-- to konta audytowe.
--
-- Konta mają służyć do przejścia ścieżki w przeglądarce, więc muszą pokazywać
-- to, co zobaczy klient: 50 dostępnych, 50 w księdze, jedna paczka.

BEGIN;

CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id     uuid,
  p_provider_id uuid,
  p_email       text,
  p_sms         integer DEFAULT 50,
  p_vin         integer DEFAULT 5,
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

  -- Pakiet trafia do PACZEK warsztatu: stare salda są martwe, a wysyłka,
  -- sprawdzenia i pytania do Rido AI czytają pulę planu i paczki.
  -- ⬇ PACZKI SMS NIE ZAKŁADAMY TUTAJ.
  --
  -- Stał tu `INSERT INTO billing_addon_packs` dla SMS-ów, a niżej stoi
  -- `grant_sms_credits` — i to ona OD 19 SIERPNIA też zakłada paczkę.
  -- Wcześniej pisała wyłącznie do księgi, więc oba wywołania miały sens.
  -- Po naszej własnej poprawce każde nowe konto dostawało DWIE paczki po
  -- `p_sms` sztuk, a księga notowała jedną: 60 dostępnych przy 30 zapisanych.
  --
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
-- Wyrównanie jedenastu kont testowych
-- ---------------------------------------------------------------------------
-- Adresy wypisane WPROST, nie wzorcem po `%audyt%`: wzorzec obejmie każde
-- przyszłe konto z tym słowem w adresie, a ta migracja ma dotknąć dokładnie
-- tych jedenastu i nigdy więcej.
CREATE TEMP TABLE cele_wyrownania ON COMMIT DROP AS
SELECT sp.id AS provider_id, u.email
FROM auth.users u
JOIN service_providers sp ON sp.user_id = u.id
WHERE u.email IN (
  'audyt.rido.sciezka@gmail.com',
  'rido.audyt.s1@gmail.com',  'rido.audyt.s2@gmail.com',  'rido.audyt.s3@gmail.com',
  'rido.audyt.s4@gmail.com',  'rido.audyt.s5@gmail.com',  'rido.audyt.s6@gmail.com',
  'rido.audyt.s7@gmail.com',  'rido.audyt.s8@gmail.com',  'rido.audyt.s9@gmail.com',
  'rido.audyt.s10@gmail.com'
);

-- KONTROLA WSTĘPNA. Wyrównanie zna stan, który zastaje: dwie nietknięte paczki
-- po 30 i 30 w księdze. Gdyby cokolwiek już z tych paczek zeszło, arytmetyka
-- niżej (skasuj jedną, drugą podnieś do 50) zabrałaby klientowi zużyte sztuki.
-- Wtedy migracja ma stanąć, a nie „poradzić sobie".
DO $KONTROLA$
DECLARE
  v_sms uuid := (SELECT id FROM billing_features WHERE key = 'sms');
  v_ile int;
  v_zle text;
BEGIN
  SELECT count(*) INTO v_ile FROM cele_wyrownania;
  IF v_ile <> 11 THEN
    RAISE EXCEPTION 'Spodziewałem się 11 kont testowych, znalazłem %. Nie wyrównuję w ciemno.', v_ile;
  END IF;

  SELECT string_agg(email || ' (' || opis || ')', ', ') INTO v_zle
  FROM (
    SELECT c.email,
           count(p.id)::text || ' paczek, suma ' ||
           coalesce(sum(p.amount_total), 0)::text || ', pozostało ' ||
           coalesce(sum(p.amount_remaining), 0)::text || ', księga ' ||
           (SELECT coalesce(sum(l.delta), 0) FROM sms_credit_ledger l
             WHERE l.provider_id = c.provider_id)::text AS opis
    FROM cele_wyrownania c
    LEFT JOIN billing_addon_packs p
      ON p.subscriber_id = c.provider_id AND p.feature_id = v_sms
    GROUP BY c.email, c.provider_id
    HAVING count(p.id) <> 2
        OR coalesce(sum(p.amount_total), 0) <> 60
        OR coalesce(sum(p.amount_remaining), 0) <> 60
        OR (SELECT coalesce(sum(l.delta), 0) FROM sms_credit_ledger l
             WHERE l.provider_id = c.provider_id) <> 30
  ) t;

  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'Stan inny niż zastany przy rozpoznaniu — %', v_zle;
  END IF;
END $KONTROLA$;

-- 1. Znika paczka BEZ pokrycia w księdze — ta zakładana wprost przez starą
--    wersję funkcji. Zostaje paczka od `grant_sms_credits`, bo tylko ona ma
--    swój wiersz księgi i tylko ona odpowiada dzisiejszemu zachowaniu.
DELETE FROM billing_addon_packs p
USING cele_wyrownania c
WHERE p.subscriber_id = c.provider_id
  AND p.feature_id = (SELECT id FROM billing_features WHERE key = 'sms')
  AND p.note = 'Pakiet startowy przy rejestracji';

-- 2. Ocalała paczka rośnie do nowej wartości pakietu startowego.
UPDATE billing_addon_packs p
SET amount_total = 50, amount_remaining = 50
FROM cele_wyrownania c
WHERE p.subscriber_id = c.provider_id
  AND p.feature_id = (SELECT id FROM billing_features WHERE key = 'sms');

-- 3. Księga notuje RÓŻNICĘ, nie nową sumę. Księga odpowiada na pytanie
--    „skąd wzięło się to, co masz" — skasowanie wpisu i wstawienie „50”
--    zatarłoby fakt, że wcześniej było 30 i że ktoś to ręcznie podniósł.
INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
SELECT c.provider_id, 20, 'wyrownanie',
       'Podniesienie pakietu startowego z 30 do 50 + usunięcie zdublowanej paczki'
FROM cele_wyrownania c;

-- 4. Rejestr pakietów startowych ma mówić to samo co paczki.
UPDATE pakiety_startowe ps
SET sms = 50
FROM cele_wyrownania c
WHERE ps.provider_id = c.provider_id;

-- ---------------------------------------------------------------------------
-- Kontrola końcowa
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_src text;
  v_zle text;
BEGIN
  -- (a) Funkcja: domyślna liczba SMS-ów naprawdę wynosi 50.
  IF pg_get_function_arguments(
       (SELECT oid FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy')
     ) NOT LIKE '%p_sms integer DEFAULT 50%' THEN
    RAISE EXCEPTION 'Domyślna liczba SMS-ów nie wynosi 50 — %',
      pg_get_function_arguments((SELECT oid FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy'));
  END IF;

  -- (b) Nie wróciło zakładanie paczki SMS obok `grant_sms_credits`. Przeniosłem
  --     ciało funkcji z poprzedniej migracji `sed`-em, ale kontrola ma sprawdzać
  --     wynik, nie moją staranność przy przenoszeniu.
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy';
  IF v_src NOT LIKE '%grant_sms_credits%' THEN
    RAISE EXCEPTION 'pakiet startowy przestał zapisywać księgę SMS';
  END IF;
  IF v_src LIKE '%Pakiet startowy przy rejestracji''%FROM billing_features f WHERE f.key = ''sms''%' THEN
    RAISE EXCEPTION 'wróciło podwójne zakładanie paczki SMS';
  END IF;

  -- (c) Konta: jedna paczka, 50 dostępnych, 50 w księdze, 50 w rejestrze.
  SELECT string_agg(email || ' → ' || opis, '; ') INTO v_zle
  FROM (
    SELECT c.email,
           count(p.id)::text || ' paczek, dostępne ' ||
           public.sms_dostepne(c.provider_id)::text || ', księga ' ||
           (SELECT coalesce(sum(l.delta), 0) FROM sms_credit_ledger l
             WHERE l.provider_id = c.provider_id)::text || ', rejestr ' ||
           coalesce((SELECT ps.sms::text FROM pakiety_startowe ps
                      WHERE ps.provider_id = c.provider_id), 'brak') AS opis
    FROM cele_wyrownania c
    LEFT JOIN billing_addon_packs p
      ON p.subscriber_id = c.provider_id
     AND p.feature_id = (SELECT id FROM billing_features WHERE key = 'sms')
    GROUP BY c.email, c.provider_id
    HAVING count(p.id) <> 1
        OR public.sms_dostepne(c.provider_id) <> 50
        OR (SELECT coalesce(sum(l.delta), 0) FROM sms_credit_ledger l
             WHERE l.provider_id = c.provider_id) <> 50
        OR coalesce((SELECT ps.sms FROM pakiety_startowe ps
                      WHERE ps.provider_id = c.provider_id), -1) <> 50
  ) t;

  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'Wyrównanie nie doszło do skutku: %', v_zle;
  END IF;

  RAISE NOTICE 'Pakiet startowy 50 SMS. Jedenaście kont testowych wyrównane: 1 paczka, 50 dostępnych, 50 w księdze.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

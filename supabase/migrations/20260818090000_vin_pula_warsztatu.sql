-- 4.12 — sprawdzenia pojazdu rozliczane z puli warsztatu (wariant W).
--
-- ⚠️ URUCHAMIAĆ PO DEPLOYU `vehicle-check` I `workshop-notify-owner`.
-- Nowa funkcja rozpoznaje oba stany; stara zna wyłącznie osobiste
-- `vehicle_lookup_credits` i po przeniesieniu odmawiałaby właścicielom.
--
-- CO ROBIMY:
--  1. `vehicle_lookup` przestaje być cechą włącz/wyłącz, a staje się mierzalna.
--     Dziś jest `boolean` z limitem NULL w każdym płatnym planie, a `check_usage`
--     czyta NULL jako „bez limitu" — czyli każdy płacący warsztat ma dziś
--     NIEOGRANICZONE sprawdzenia VIN za darmo, choć każde kosztuje nas realnie
--     u dostawcy, a produkt „Sprawdzenia pojazdu" po 1,70 zł jest przez to
--     niesprzedawalny.
--  2. Kredyty WŁAŚCICIELI warsztatów idą do puli firmy. Pracownicy zachowują
--     swoje (osobna decyzja: mogą ich użyć za zgodą, gdy pula firmy pusta).
--  3. `billing_wydaj_paczke` przestaje dublować zapis.
--
-- CZEGO NIE RUSZAMY: użytkowników bez warsztatu (portal klienta, flota) —
-- zostają na własnym saldzie i nic dla nich się nie zmienia.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Zapis stanu sprzed — warunek odwracalności
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vin_migracja_4_12 (
  provider_id                     uuid PRIMARY KEY,
  wlasciciel_user_id              uuid NOT NULL,
  saldo_przed                     integer NOT NULL,
  paczki_odzwierciedlone_przed    numeric(12,2) NOT NULL DEFAULT 0,
  paczki_nieodzwierciedlone_przed numeric(12,2) NOT NULL DEFAULT 0,
  pack_id                         uuid,
  wykonano_at                     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vin_migracja_4_12_paczki (
  pack_id         uuid PRIMARY KEY,
  remaining_przed numeric(12,2) NOT NULL
);

ALTER TABLE public.vin_migracja_4_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vin_migracja_4_12_paczki ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vin_migracja_4_12 FROM anon, authenticated;
REVOKE ALL ON public.vin_migracja_4_12_paczki FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ewidencja użycia zapamiętuje warsztat
-- ---------------------------------------------------------------------------
-- Właściciel ma widzieć, KTO sprawdzał z puli firmy, a nie tylko ile zeszło.
ALTER TABLE public.vehicle_lookup_usage
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.service_providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_lookup_usage_provider
  ON public.vehicle_lookup_usage (provider_id, created_at DESC)
  WHERE provider_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Cecha mierzalna zamiast włącz/wyłącz
-- ---------------------------------------------------------------------------
UPDATE public.billing_features
SET kind = 'metered', unit = 'sprawdzenie'
WHERE key = 'vehicle_lookup';

-- ---------------------------------------------------------------------------
-- 4. VIN NIE WCHODZI W ABONAMENT — limit zero we wszystkich planach
-- ---------------------------------------------------------------------------
-- Sprawdzenia pojazdu są osobnym produktem, nie funkcją abonamentu. Każdy plan
-- ma limit 0; jedyne źródła to pakiet startowy (5 przy rejestracji) i suwak
-- doładowań (krok 10 po 1,70 zł).
--
-- Dlaczego 0, a nie NULL: `check_usage` czyta NULL jako „bez limitu" i zwraca
-- `unlimited`. Zero znaczy „funkcja jest w planie, ale z zerowym przydziałem",
-- więc `check_usage` schodzi do paczek — dokładnie tego chcemy. Różnica między
-- NULL a 0 to tu różnica między „za darmo bez końca" a „tylko z doładowania".
--
-- Zaleta wobec limitów per plan: nie trzeba tego pilnować przy każdym nowym
-- planie. Zasada jest jedna i sama się broni.
UPDATE public.billing_plan_features pf
SET limit_value = 0
FROM public.billing_features f
WHERE pf.feature_id = f.id AND f.key = 'vehicle_lookup';

-- Plany, które tej cechy jeszcze nie mają (np. darmowy), dostają ją z zerem —
-- inaczej `check_usage` zwróciłby `feature_not_in_plan`, a to inny komunikat
-- niż „doładuj" i użytkownik nie wiedziałby, że produkt w ogóle istnieje.
INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id, true, 0
FROM public.billing_plans p
CROSS JOIN public.billing_features f
WHERE f.key = 'vehicle_lookup'
  AND p.subscriber_type = 'service_provider'
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_plan_features x
    WHERE x.plan_id = p.id AND x.feature_id = f.id)
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- 4c. Kontrola: żaden plan nie może zostać z NULL.
-- NULL = „bez limitu" = darmowe sprawdzenia bez końca. Przy nowym modelu ma to
-- być NIEMOŻLIWE, więc migracja przerywa i wypisuje winowajcę.
DO $$
DECLARE v_brak text;
BEGIN
  SELECT string_agg(p.code, ', ') INTO v_brak
  FROM billing_plan_features pf
  JOIN billing_plans p ON p.id = pf.plan_id
  JOIN billing_features f ON f.id = pf.feature_id
  WHERE f.key = 'vehicle_lookup' AND pf.limit_value IS NULL AND pf.is_enabled;

  IF v_brak IS NOT NULL THEN
    RAISE EXCEPTION 'Plany bez limitu sprawdzeń: %. NULL znaczy „bez limitu" — to darmowe VIN-y bez końca.', v_brak;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Stawka nadwyżki — zgodna z ceną doładowania
-- ---------------------------------------------------------------------------
UPDATE public.billing_features SET overage_price_net = 1.70 WHERE key = 'vehicle_lookup';

-- ---------------------------------------------------------------------------
-- 6. Przeniesienie kredytów właścicieli do puli firmy
-- ---------------------------------------------------------------------------
-- Źródło 'migracja' dołożyła migracja SMS-owa (4.10). Powtarzamy to tutaj
-- zamiast zakładać, że tamta na pewno poszła — wyszło na lokalnym uruchomieniu,
-- gdzie 4.10 nie było i całość padła na ograniczeniu sprawdzającym.
ALTER TABLE public.billing_addon_packs
  DROP CONSTRAINT IF EXISTS billing_addon_packs_source_check;
ALTER TABLE public.billing_addon_packs
  ADD CONSTRAINT billing_addon_packs_source_check CHECK (source IN
    ('purchase', 'admin_grant', 'compensation', 'migracja'));

-- Ta sama zasada co przy SMS-ach: paczki ze znacznikiem `odzwierciedlone_at`
-- to DUPLIKATY — przy zakupie powstała paczka i JEDNOCZEŚNIE doliczono
-- jednostki do osobistego salda, a wydawało się tylko z salda. Prawdą jest
-- saldo. Duplikaty zerujemy, zakładamy jedną paczkę równą saldu.
DO $$
DECLARE
  v_vin   uuid;
  w       record;
  v_dubl  numeric;
  v_nowe  numeric;
  v_pack  uuid;
  v_przed numeric;
  v_po    numeric;
  v_ile   integer := 0;
BEGIN
  SELECT id INTO v_vin FROM billing_features WHERE key = 'vehicle_lookup';
  IF v_vin IS NULL THEN
    RAISE EXCEPTION 'Brak cechy vehicle_lookup — nie ma czego przenosić';
  END IF;

  FOR w IN
    SELECT sp.id, sp.company_name, sp.user_id,
           COALESCE(vlc.remaining_credits, 0) AS saldo
    FROM service_providers sp
    LEFT JOIN vehicle_lookup_credits vlc ON vlc.user_id = sp.user_id
    -- Blokada wiersza: sprawdzenie VIN w trakcie migracji POCZEKA, zamiast
    -- zdjąć jednostkę z salda, które właśnie przenosimy.
    FOR UPDATE OF sp
  LOOP
    SELECT COALESCE(sum(amount_remaining), 0) INTO v_dubl
    FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_vin AND amount_remaining > 0 AND odzwierciedlone_at IS NOT NULL
      AND source <> 'migracja';

    SELECT COALESCE(sum(amount_remaining), 0) INTO v_nowe
    FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_vin AND amount_remaining > 0 AND odzwierciedlone_at IS NULL;

    CONTINUE WHEN w.saldo = 0 AND v_dubl = 0 AND v_nowe = 0;

    -- 🔴 ZABEZPIECZENIE PRZED DRUGIM URUCHOMIENIEM.
    -- Bez tego powtórka KASUJE jednostki: paczka scalona powstaje ze
    -- znacznikiem `odzwierciedlone_at`, więc przy drugim przebiegu krok
    -- „wyzeruj duplikaty" dopasowuje ją samą. Kontrola „przed = po" tego NIE
    -- wykrywa, bo saldo właściciela jest już zerowe i obie strony równania
    -- wychodzą zgodnie — migracja melduje sukces, a klient traci to, co miał.
    CONTINUE WHEN EXISTS (SELECT 1 FROM vin_migracja_4_12 WHERE provider_id = w.id);

    v_przed := w.saldo + v_nowe;

    INSERT INTO vin_migracja_4_12
      (provider_id, wlasciciel_user_id, saldo_przed,
       paczki_odzwierciedlone_przed, paczki_nieodzwierciedlone_przed)
    VALUES (w.id, w.user_id, w.saldo, v_dubl, v_nowe)
    ON CONFLICT (provider_id) DO NOTHING;

    INSERT INTO vin_migracja_4_12_paczki (pack_id, remaining_przed)
    SELECT id, amount_remaining FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_vin AND amount_remaining > 0 AND odzwierciedlone_at IS NOT NULL
      AND source <> 'migracja'
    ON CONFLICT (pack_id) DO NOTHING;

    UPDATE billing_addon_packs
    SET amount_remaining = 0,
        note = COALESCE(note, '') || ' [4.12: jednostki przeniesione do paczki firmowej]',
        updated_at = now()
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_vin AND amount_remaining > 0 AND odzwierciedlone_at IS NOT NULL
      -- Paczka założona przez migrację NIE jest duplikatem — jest wynikiem.
      AND source <> 'migracja';

    IF w.saldo > 0 THEN
      INSERT INTO billing_addon_packs
        (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
         expires_at, source, note, odzwierciedlone_at)
      VALUES ('service_provider', w.id, v_vin, w.saldo, w.saldo,
              NULL, 'migracja',
              'Kredyty właściciela przeniesione do puli warsztatu (4.12)', now())
      RETURNING id INTO v_pack;

      UPDATE vin_migracja_4_12 SET pack_id = v_pack WHERE provider_id = w.id;

      UPDATE vehicle_lookup_credits
      SET remaining_credits = 0
      WHERE user_id = w.user_id;

      INSERT INTO vehicle_lookup_credit_transactions
        (user_id, type, credits, source, note)
      VALUES (w.user_id, 'usage', -w.saldo, 'system',
              'Przeniesienie do puli warsztatu ' || w.company_name || ' (4.12)');
    END IF;

    -- ── Kontrola W TEJ SAMEJ TRANSAKCJI ────────────────────────────
    SELECT COALESCE(sum(amount_remaining), 0) INTO v_po
    FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_vin AND amount_remaining > 0;

    IF v_po <> v_przed THEN
      RAISE EXCEPTION
        'Rozjazd dla % (%): przed = %, po = %. Migracja wycofana.',
        w.company_name, w.id, v_przed, v_po;
    END IF;

    v_ile := v_ile + 1;
    RAISE NOTICE 'przeniesiono %: % sprawdzeń', w.company_name, v_po;
  END LOOP;

  RAISE NOTICE 'Przeniesiono % warsztatów', v_ile;
END $$;

-- ---------------------------------------------------------------------------
-- 7. 🔴 Koniec podwójnego zapisu przy zakupie
-- ---------------------------------------------------------------------------
-- `billing_wydaj_paczke` przy każdym zakupie zakłada paczkę I dopisuje do
-- starego salda, po czym oznacza paczkę `odzwierciedlone_at`. Po przełączeniu
-- SMS-ów (4.10) to saldo jest martwe — nikt go nie czyta — ale znacznik
-- zostaje. A `odzwierciedlone_at IS NOT NULL` to dokładnie ten warunek, po
-- którym migracje 4.10 i 4.12 rozpoznają paczki DO WYZEROWANIA.
--
-- Innymi słowy: każda paczka opłacona po 4.10 wygląda jak duplikat i przy
-- ponownym uruchomieniu tej logiki zostałaby wyzerowana. Klient straciłby to,
-- za co zapłacił. Zamykamy to teraz.
CREATE OR REPLACE FUNCTION public.billing_wydaj_paczke(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_prod   billing_addon_products%ROWTYPE;
  v_klucz  text;
  v_pack   uuid;
  v_wygasa timestamptz;
BEGIN
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma zamówienia %', p_order_id;
  END IF;

  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN v_zam.pack_id;
  END IF;

  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: zamówienie % nie jest opłacone (%)', p_order_id, v_zam.status;
  END IF;

  SELECT * INTO v_prod FROM billing_addon_products WHERE id = v_zam.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma produktu %', v_zam.product_id;
  END IF;

  SELECT key INTO v_klucz FROM billing_features WHERE id = v_prod.feature_id;

  IF v_prod.waznosc_dni IS NOT NULL THEN
    v_wygasa := now() + make_interval(days => v_prod.waznosc_dni);
  END IF;

  INSERT INTO billing_addon_packs (
    subscriber_type, subscriber_id, feature_id,
    amount_total, amount_remaining, expires_at, source, order_id, note)
  VALUES (
    v_zam.subscriber_type, v_zam.subscriber_id, v_prod.feature_id,
    v_zam.units, v_zam.units, v_wygasa, 'purchase', v_zam.id,
    'Doładowanie: ' || v_zam.units || ' × ' || v_prod.name)
  RETURNING id INTO v_pack;

  -- ── Paczka JEST saldem ───────────────────────────────────────────
  -- Do 4.10/4.12 zakup zakładał paczkę I dopisywał jednostki do starej kolumny
  -- (`sms_balance`, `vehicle_lookup_credits`), oznaczając paczkę
  -- `odzwierciedlone_at`. Po przełączeniu wydaje się już z paczek, więc ten
  -- drugi zapis jest martwy — ale znacznik zostawał, a `odzwierciedlone_at
  -- IS NOT NULL` to dokładnie warunek, po którym migracje 4.10 i 4.12
  -- rozpoznają paczki DO WYZEROWANIA. Każda paczka opłacona po przełączeniu
  -- wyglądała więc jak duplikat i przy ponownym uruchomieniu tej logiki
  -- zostałaby wyzerowana — klient straciłby to, za co zapłacił.
  --
  -- Wyjątek: kupujący BEZ warsztatu (portal klienta, flota). Dla niego osobiste
  -- saldo nadal jest jedyną pulą, więc paczka musi je zasilić.
  IF v_klucz = 'vehicle_lookup'
     AND v_zam.subscriber_type <> 'service_provider'
     AND v_zam.user_id IS NOT NULL THEN
    INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
    VALUES (v_zam.user_id, v_zam.units::integer, v_zam.units::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET remaining_credits       = vehicle_lookup_credits.remaining_credits + EXCLUDED.remaining_credits,
          total_credits_purchased = COALESCE(vehicle_lookup_credits.total_credits_purchased, 0)
                                    + EXCLUDED.total_credits_purchased;

    INSERT INTO vehicle_lookup_credit_transactions (user_id, type, credits, source, note)
    VALUES (v_zam.user_id, 'purchase', v_zam.units::integer, 'payment',
            'Doładowanie PayU, zamówienie ' || v_zam.id);

    UPDATE billing_addon_packs SET odzwierciedlone_at = now() WHERE id = v_pack;
  END IF;

  UPDATE billing_orders
  SET wydane_at = now(), pack_id = v_pack, updated_at = now()
  WHERE id = p_order_id;

  RETURN v_pack;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. 🔴 Pakiet startowy: 30 SMS + 5 sprawdzeń, do paczek warsztatu
-- ---------------------------------------------------------------------------
-- Liczba SMS-ów zmieniona z 50 na 30 (Twoja decyzja).
--
-- Ale ważniejsze jest GDZIE trafiają: dotąd SMS-y szły do `sms_balance`, którą
-- migracja 4.10 uczyniła martwą. Nic jej nie czyta — `sms_dostepne` liczy plan
-- plus paczki, a `deduct_sms_credit` idzie przez `billing_consume`. Każdy
-- warsztat zarejestrowany PO 4.10 dostał więc pakiet startowy, którego nie ma.
-- Poniżej jest lista tych warsztatów (sekcja 9) — wymagają wyrównania.
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
  v_email text := lower(btrim(p_email));
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

  -- ── Pakiet startowy trafia do PACZEK warsztatu ───────────────────
  -- Wcześniej SMS-y szły przez `grant_sms_credits` do `sms_balance`, a
  -- sprawdzenia do osobistego `vehicle_lookup_credits` właściciela. Po
  -- przełączeniu na `billing_consume` (4.10 dla SMS, 4.12 dla VIN) żadne
  -- z tych miejsc nie jest już źródłem prawdy: wysyłka i sprawdzenia czytają
  -- pulę planu i paczki. Pakiet startowy zapisany po staremu byłby
  -- NIEWIDOCZNY — warsztat dostawałby jednostki, których nie może wydać.
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

  -- Księga SMS zostaje — to ona odpowiada na pytanie „skąd to saldo".
  -- Bez zmiany `sms_balance`: ta kolumna jest po 4.10 martwa.
  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
  VALUES (p_provider_id, p_sms, 'pakiet_startowy', 'Pakiet startowy przy rejestracji');

  RAISE NOTICE 'Pakiet startowy dla % : % SMS, % VIN', v_email, p_sms, p_vin;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Kto dostał pakiet startowy, którego nie widzi — TYLKO ROZPOZNANIE
-- ---------------------------------------------------------------------------
-- Świadomie NIC nie naprawiamy. Dosypanie jednostek to zmiana danych klienta
-- wstecz i wymaga osobnej decyzji — migracja ma o tym POWIEDZIEĆ, nie zrobić
-- tego przy okazji czegoś innego. Zapytanie naprawcze jest w
-- docs/billing/4-12-pakiet-startowy-wyrownanie.sql.
DO $$
DECLARE
  v_ile  integer;
  v_lista text;
BEGIN
  SELECT count(*), string_agg(sp.company_name, ', ')
  INTO v_ile, v_lista
  FROM pakiety_startowe ps
  JOIN service_providers sp ON sp.id = ps.provider_id
  WHERE NOT EXISTS (
    SELECT 1 FROM billing_addon_packs p
    JOIN billing_features f ON f.id = p.feature_id
    WHERE p.subscriber_type = 'service_provider'
      AND p.subscriber_id = ps.provider_id
      AND f.key = 'sms'
      AND p.note = 'Pakiet startowy przy rejestracji');

  IF v_ile > 0 THEN
    RAISE WARNING 'Pakiet startowy bez pokrycia w paczkach: % warsztatów (%). Sprawdzone 16.08: jedyny wiersz to konto testowe, wyrównania świadomie nie robimy',
      v_ile, left(COALESCE(v_lista, ''), 200);
  ELSE
    RAISE NOTICE 'Pakiety startowe: wszystkie mają pokrycie w paczkach.';
  END IF;
END $$;


COMMIT;

NOTIFY pgrst, 'reload schema';

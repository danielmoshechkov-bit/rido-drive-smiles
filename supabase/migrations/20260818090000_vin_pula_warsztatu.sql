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
-- 4. Limity sprawdzeń w planach
-- ---------------------------------------------------------------------------
-- Liczby Twoje, z sześciu miesięcy zużycia: 12-20 sprawdzeń na użytkownika
-- miesięcznie. Moja pierwsza propozycja (40/150/400) była zapasem, którego
-- nikt by nie dobił — a limit, którego nie da się wyczerpać, nie jest limitem
-- i nie sprzeda ani jednego doładowania.
--
-- Dane są mocniejszą podstawą, niż zakładałem: od marca do 5 sierpnia działał
-- dystrybutor darmowych kredytów (usunięty w 4.13), więc to zużycie NIE było
-- niczym ograniczone. Ludzie mogli sobie dosypać i mimo to brali 12-20.
--
-- TRZY POPRAWKI wobec listy, którą podałeś:
--  * `trial_warsztat` NIE ISTNIEJE — plan próbny ma kod `trial_max`. Wpis
--    z nieistniejącym kodem nie rzuca błędu, tylko cicho nie zmienia nic.
--  * `warsztat_free` nie ma `vehicle_lookup` w planie w ogóle, więc poniżej
--    jest INSERT, nie UPDATE (patrz sekcja 4b).
--  * `bundle_warsztat_agent` i `bundle_max` były pominięte, a mają tę cechę.
--    Zostawione z NULL zachowałyby NIEOGRANICZONE darmowe sprawdzenia
--    w najdroższych pakietach. Przypisane do odpowiadających im poziomów —
--    potwierdź, jeśli miały być inne.
UPDATE public.billing_plan_features pf
SET limit_value = v.limit_value
FROM (VALUES
  ('warsztat_standard',       15),
  ('warsztat_pro',            40),
  ('warsztat_sieci',         150),
  ('bundle_warsztat_agent',   40),   -- poziom Pro
  ('bundle_max',             150),   -- poziom Sieci
  ('trial_max',               40)    -- okres próbny w zakresie Pro
) AS v(plan_code, limit_value)
JOIN public.billing_plans p ON p.code = v.plan_code
JOIN public.billing_features f ON f.key = 'vehicle_lookup'
WHERE pf.plan_id = p.id AND pf.feature_id = f.id;

-- 4b. Plan darmowy dostaje tę cechę po raz pierwszy — stąd INSERT.
INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id, true, 3
FROM public.billing_plans p, public.billing_features f
WHERE p.code = 'warsztat_free' AND f.key = 'vehicle_lookup'
ON CONFLICT (plan_id, feature_id) DO UPDATE SET limit_value = 3, is_enabled = true;

-- 4c. Kontrola: żaden plan z tą cechą nie może zostać bez limitu.
-- NULL znaczy „bez limitu", więc pominięty plan = darmowe sprawdzenia bez końca.
-- Lepiej zatrzymać migrację, niż zostawić otwartą dziurę i nie wiedzieć o tym.
DO $$
DECLARE v_brak text;
BEGIN
  SELECT string_agg(p.code, ', ') INTO v_brak
  FROM billing_plan_features pf
  JOIN billing_plans p ON p.id = pf.plan_id
  JOIN billing_features f ON f.id = pf.feature_id
  WHERE f.key = 'vehicle_lookup' AND pf.limit_value IS NULL AND pf.is_enabled;

  IF v_brak IS NOT NULL THEN
    RAISE EXCEPTION 'Plany bez limitu sprawdzeń: %. To darmowe VIN-y bez końca — uzupełnij sekcję 4.', v_brak;
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

COMMIT;

NOTIFY pgrst, 'reload schema';

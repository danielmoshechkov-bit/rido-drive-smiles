-- Sprzątnięcie auta pokazowego z kartotek trzech warsztatów.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SKĄD SIĘ TAM WZIĘŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- Skrót w `WorkshopAddVehicleDialog` rozpoznawał auto pokazowe PO WPISANYM
-- NUMERZE i działał zawsze, nie tylko we wprowadzeniu. Numerem pokazowym było
-- `WW140TV` — PRAWDZIWA tablica, należąca do Opla Astry IV
-- (VIN `W0VPD5ED4JG110852`, potwierdzone w rejestrze).
--
-- Warsztat, który miał to auto na warsztacie, wpisywał jego numer i dostawał
-- Toyotę Auris HSD z wymyślonym VIN-em `SB1KZ3JE60E123456` — zapisaną od razu
-- do kartoteki przez `autoSaveVehicle`, bez pytania rejestru.
--
-- Zmierzone przed migracją: **20 wierszy** o tym podpisie u trzech warsztatów
-- (CART 18, AUTO-SERWIS HAWRYLUK 1, CART78GARAGE 1).
--
-- Od 10.09.2026 auto pokazowe wczytuje osobny PRZYCISK, a jego numer to
-- `DEMO-RIDO` — z myślnikiem, którego polska tablica nie zawiera, więc żadna
-- prawdziwa rejestracja nie może się z nim zderzyć.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KASUJEMY WYŁĄCZNIE WIERSZE, NA KTÓRYCH NIC NIE WISI
-- ═══════════════════════════════════════════════════════════════════════════
-- Więzy do `workshop_vehicles` NIE MAJĄ `ON DELETE CASCADE` — sprawdzone:
--   workshop_orders.vehicle_id, workshop_tire_storage.vehicle_id,
--   workshop_clients.default_vehicle_id
-- Kasowanie wiersza z podpiętym zleceniem po prostu by padło, więc odsiewamy
-- takie wiersze SAMI i mówimy o nich wprost. Dwa z dwudziestu mają zlecenia:
-- to zlecenia, które warsztat naprawdę założył, i nie wolno ich stracić przy
-- sprzątaniu czegoś, co je poprzedza.
--
-- Podpis dobrany WĄSKO: tablica ORAZ dokładny VIN auta pokazowego. Sam numer
-- rejestracyjny objąłby prawdziwego Opla, który pod tą tablicą też stoi
-- w kartotece — i to jego skasowalibyśmy klientowi.

BEGIN;

CREATE TEMP TABLE do_skasowania ON COMMIT DROP AS
SELECT wv.id, wv.provider_id
FROM workshop_vehicles wv
WHERE upper(replace(coalesce(wv.plate, ''), ' ', '')) = 'WW140TV'
  AND upper(coalesce(wv.vin, '')) = 'SB1KZ3JE60E123456'
  AND NOT EXISTS (SELECT 1 FROM workshop_orders o       WHERE o.vehicle_id = wv.id)
  AND NOT EXISTS (SELECT 1 FROM workshop_tire_storage t WHERE t.vehicle_id = wv.id)
  AND NOT EXISTS (SELECT 1 FROM workshop_clients c      WHERE c.default_vehicle_id = wv.id);

DO $KONTROLA$
DECLARE
  v_wszystkich int;
  v_wolnych    int;
BEGIN
  SELECT count(*) INTO v_wszystkich FROM workshop_vehicles
  WHERE upper(replace(coalesce(plate, ''), ' ', '')) = 'WW140TV'
    AND upper(coalesce(vin, '')) = 'SB1KZ3JE60E123456';
  SELECT count(*) INTO v_wolnych FROM do_skasowania;

  -- Nie kasujemy w ciemno. Rozpoznanie z 10.09 mówiło: 20 wierszy, 18 wolnych.
  -- Inny stan znaczy, że coś się zmieniło od rozpoznania — wtedy migracja ma
  -- STANĄĆ, a nie „poradzić sobie".
  IF v_wszystkich > 25 THEN
    RAISE EXCEPTION 'Znalazlem % wierszy auta pokazowego zamiast okolo 20 — stan inny niz przy rozpoznaniu, nie kasuje', v_wszystkich;
  END IF;

  RAISE NOTICE 'Auto pokazowe w kartotekach: % wierszy, z tego % bez zadnych powiazan.', v_wszystkich, v_wolnych;
END $KONTROLA$;

DELETE FROM workshop_vehicles wv USING do_skasowania d WHERE wv.id = d.id;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_zostalo int;
  v_opis    text;
  v_opel    int;
BEGIN
  -- (a) Zostały wyłącznie wiersze, na których coś wisi — i mówimy które.
  SELECT count(*) INTO v_zostalo FROM workshop_vehicles
  WHERE upper(replace(coalesce(plate, ''), ' ', '')) = 'WW140TV'
    AND upper(coalesce(vin, '')) = 'SB1KZ3JE60E123456';

  IF v_zostalo > 0 THEN
    SELECT string_agg(sp.company_name || ' (' || ile || ' zlecen)', ', ') INTO v_opis
    FROM (
      SELECT wv.provider_id,
             (SELECT count(*) FROM workshop_orders o WHERE o.vehicle_id = wv.id) AS ile
      FROM workshop_vehicles wv
      WHERE upper(replace(coalesce(wv.plate, ''), ' ', '')) = 'WW140TV'
        AND upper(coalesce(wv.vin, '')) = 'SB1KZ3JE60E123456'
    ) t JOIN service_providers sp ON sp.id = t.provider_id;

    RAISE WARNING 'Zostalo % wierszy auta pokazowego z podpietymi zleceniami: %. Nie kasuje ich — zlecenia sa prawdziwe. Do rozstrzygniecia osobno.', v_zostalo, v_opis;
  END IF;

  -- (b) KONTROLA ODWROTNA: prawdziwy Opel pod tą samą tablicą MA ZOSTAĆ.
  --     To jest ten wiersz, którego skasowanie byłoby prawdziwą szkodą.
  SELECT count(*) INTO v_opel FROM workshop_vehicles
  WHERE upper(replace(coalesce(plate, ''), ' ', '')) = 'WW140TV'
    AND upper(coalesce(vin, '')) = 'W0VPD5ED4JG110852';
  IF v_opel = 0 THEN
    RAISE EXCEPTION 'Znikl prawdziwy Opel spod tablicy WW140TV — sprzatanie objelo za duzo';
  END IF;

  RAISE NOTICE 'Sprzatanie zakonczone. Prawdziwy pojazd pod ta tablica nietkniety (% wierszy).', v_opel;
END $KONIEC$;

COMMIT;

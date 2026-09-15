-- ═══════════════════════════════════════════════════════════════════════════
-- SCALENIE ZDUPLIKOWANYCH POJAZDÓW W KARTOTEKACH WARSZTATÓW
-- ═══════════════════════════════════════════════════════════════════════════
-- Na 15.09.2026: 334 pojazdy, z tego 68 nadmiarowych w 56 grupach u 5 warsztatów
-- — co piąty wiersz tabeli. Każde auto dwa razy: raz z właścicielem, raz bez.
--
-- PRZYCZYNA JEST JUŻ NAPRAWIONA W KODZIE (`useCreateWorkshopVehicle` szuka
-- istniejącego wiersza przed zapisem). Ta migracja sprząta to, co powstało
-- wcześniej. Twardą bramką będzie indeks unikalny — OSOBNA migracja, PO tej.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- GRUPUJEMY PO TABLICY, NIE PO TABLICY I VIN-ie
-- ═══════════════════════════════════════════════════════════════════════════
-- Bo tak będzie działał indeks: `(provider_id, tablica)`. Gdyby scalać po
-- parze (tablica, VIN), zostałyby grupy o jednej tablicy i dwóch VIN-ach,
-- a indeks i tak by ich nie przyjął.
--
-- Sprawdzone: pięć takich grup i ŻADNA nie jest dwoma różnymi autami —
-- to ten sam pojazd z uszkodzonym VIN-em z wyszukiwarki:
--
--   WND7946E   WMW0489            obok  WMWXR5C05L2L70489
--   WS9995E    JS30504            obok  JS3TD0D71C4100504
--   WI0034V    5J66061            obok  5J6YH18513L016061
--   WI658ME    WBAWZ510100M31178  obok  WAUZZZ4M0HD045245   (drugi to VIN Audi — błędny odczyt)
--
-- Wyjątkiem jest WW140TV i to NIE jest duplikat, tylko wpis pokazowy — patrz krok 0.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KTÓRY WIERSZ ZOSTAJE
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ten, który MA właściciela (do niego podpina się historia klienta),
-- 2. przy remisie — STARSZY (do niego pasuje historia napraw),
-- 3. przy dalszym remisie — mniejsze `id`, żeby wynik był powtarzalny.
--
-- Puste pola wiersza zachowanego uzupełniamy z odrzucanych — VIN, rocznik
-- i dane silnika bywają wyłącznie na kopii z wyszukiwarki. VIN bierzemy
-- NAJDŁUŻSZY: siedmioznakowy to obcięty odczyt, a nie inny samochód.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- KROK 0 — WPISY POKAZOWE (do wykreślenia, jeśli mają zostać)
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 TO NIE SĄ DUPLIKATY, TYLKO ŚLAD PO STARYM AUCIE POKAZOWYM.
-- Wprowadzenie miało kiedyś na stałe tablicę `WW140TV` — numer należący do
-- prawdziwego Opla Astry. Zostało to naprawione (`autoDemo.ts`: `DEMO-RIDO`),
-- ale w kartotece CART sp. z o.o. zostały DWIE Toyoty Auris HSD z VIN-em
-- pokazowym `SB1KZ3JE60E123456`, a pod tą samą tablicą stoją TRZY prawdziwe Ople.
--
-- Do Toyot podpięte jest PIĘĆ zleceń: ZL-08/2026-001 … 005, wszystkie
-- z 23.08, wszystkie na klienta „Jan Nowak" (to klient pokazowy), wszystkie
-- BEZ POZYCJI i na kwotę 0 zł. To są zlecenia z prezentacji systemu, nie praca.
--
-- Kasujemy najpierw zlecenia, potem pojazdy — inaczej odbije się klucz obcy.
-- Jeśli mają zostać, wykreśl oba `DELETE` niżej; reszta migracji zadziała
-- bez zmian, a Toyoty zostaną scalone w jeden wiersz obok Opli.
DELETE FROM public.workshop_orders
WHERE vehicle_id IN (SELECT id FROM public.workshop_vehicles
                     WHERE upper(coalesce(vin,'')) = 'SB1KZ3JE60E123456');

DELETE FROM public.workshop_vehicles
WHERE upper(coalesce(vin,'')) = 'SB1KZ3JE60E123456';

-- ═══════════════════════════════════════════════════════════════════════════
-- KROK 1 — KTO Z KIM
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE scalanie ON COMMIT DROP AS
WITH n AS (
  SELECT id, provider_id, owner_client_id, created_at,
         upper(regexp_replace(coalesce(plate,''), '[^A-Za-z0-9]', '', 'g')) AS tablica
  FROM public.workshop_vehicles
),
grupy AS (
  SELECT provider_id, tablica FROM n
  WHERE tablica <> ''
  GROUP BY 1, 2 HAVING count(*) > 1
),
ranking AS (
  SELECT n.*,
         row_number() OVER (
           PARTITION BY n.provider_id, n.tablica
           ORDER BY (n.owner_client_id IS NULL), n.created_at, n.id
         ) AS miejsce
  FROM n JOIN grupy g ON g.provider_id = n.provider_id AND g.tablica = n.tablica
)
SELECT r.id AS id_odrzucany,
       z.id AS id_zachowany,
       r.provider_id, r.tablica
FROM ranking r
JOIN ranking z ON z.provider_id = r.provider_id AND z.tablica = r.tablica AND z.miejsce = 1
WHERE r.miejsce > 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- KROK 2 — PRZENIESIENIE TEGO, CO WISI NA ODRZUCANYCH
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.workshop_orders o
SET vehicle_id = s.id_zachowany
FROM scalanie s WHERE o.vehicle_id = s.id_odrzucany;

UPDATE public.workshop_tire_storage t
SET vehicle_id = s.id_zachowany
FROM scalanie s WHERE t.vehicle_id = s.id_odrzucany;

UPDATE public.workshop_clients c
SET default_vehicle_id = s.id_zachowany
FROM scalanie s WHERE c.default_vehicle_id = s.id_odrzucany;

-- ═══════════════════════════════════════════════════════════════════════════
-- KROK 3 — UZUPEŁNIENIE PUSTYCH PÓL WIERSZA ZACHOWANEGO
-- ═══════════════════════════════════════════════════════════════════════════
-- Tylko tam, gdzie zachowany ma pustkę. Nic nie nadpisujemy: dane wpisane
-- ręcznie przez warsztat są wiarygodniejsze niż odczyt z rejestru.
-- VIN bierzemy NAJDŁUŻSZY — siedmioznakowy to obcięty odczyt.
UPDATE public.workshop_vehicles v
SET vin                 = coalesce(v.vin, d.vin),
    brand               = coalesce(v.brand, d.brand),
    model               = coalesce(v.model, d.model),
    color               = coalesce(v.color, d.color),
    year                = coalesce(v.year, d.year),
    first_registration_date = coalesce(v.first_registration_date, d.first_registration_date),
    fuel_type           = coalesce(v.fuel_type, d.fuel_type),
    engine_number       = coalesce(v.engine_number, d.engine_number),
    engine_capacity_cm3 = coalesce(v.engine_capacity_cm3, d.engine_capacity_cm3),
    engine_power_kw     = coalesce(v.engine_power_kw, d.engine_power_kw),
    description         = coalesce(v.description, d.description),
    owner_client_id     = coalesce(v.owner_client_id, d.owner_client_id),
    updated_at          = now()
FROM (
  SELECT s.id_zachowany,
         (array_agg(o.vin ORDER BY length(coalesce(o.vin,'')) DESC)
            FILTER (WHERE o.vin IS NOT NULL))[1]                         AS vin,
         min(o.brand)  AS brand,  min(o.model) AS model, min(o.color) AS color,
         min(o.year)   AS year,   min(o.first_registration_date) AS first_registration_date,
         min(o.fuel_type) AS fuel_type, min(o.engine_number) AS engine_number,
         min(o.engine_capacity_cm3) AS engine_capacity_cm3,
         min(o.engine_power_kw)     AS engine_power_kw,
         min(o.description)         AS description,
         (array_agg(o.owner_client_id ORDER BY o.created_at)
            FILTER (WHERE o.owner_client_id IS NOT NULL))[1] AS owner_client_id
  FROM scalanie s JOIN public.workshop_vehicles o ON o.id = s.id_odrzucany
  GROUP BY s.id_zachowany
) d
WHERE v.id = d.id_zachowany;

-- Osobno VIN: gdy zachowany ma odczyt OBCIĘTY (krótszy niż 17 znaków),
-- a odrzucany pełny — bierzemy pełny. `coalesce` wyżej tego nie załatwia,
-- bo pole nie jest puste, tylko złe.
UPDATE public.workshop_vehicles v
SET vin = d.vin_pelny
FROM (
  SELECT s.id_zachowany,
         (array_agg(o.vin ORDER BY length(coalesce(o.vin,'')) DESC))[1] AS vin_pelny
  FROM scalanie s JOIN public.workshop_vehicles o ON o.id = s.id_odrzucany
  WHERE length(coalesce(o.vin,'')) = 17
  GROUP BY s.id_zachowany
) d
WHERE v.id = d.id_zachowany
  AND length(coalesce(v.vin,'')) <> 17;

-- ═══════════════════════════════════════════════════════════════════════════
-- KROK 4 — SKASOWANIE NADMIAROWYCH
-- ═══════════════════════════════════════════════════════════════════════════
DELETE FROM public.workshop_vehicles v
USING scalanie s WHERE v.id = s.id_odrzucany;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — NIC NIE MIAŁO PRZEPAŚĆ
-- ═══════════════════════════════════════════════════════════════════════════
DO $kontrola$
DECLARE
  v_grup_po      int;
  v_osierocone   int;
  v_zlecen_po    int;
  v_opon_po      int;
BEGIN
  -- 1. Żadnej grupy z więcej niż jednym wierszem na tablicę.
  SELECT count(*) INTO v_grup_po FROM (
    SELECT provider_id, upper(regexp_replace(coalesce(plate,''),'[^A-Za-z0-9]','','g')) AS t
    FROM public.workshop_vehicles
    WHERE upper(regexp_replace(coalesce(plate,''),'[^A-Za-z0-9]','','g')) <> ''
    GROUP BY 1,2 HAVING count(*) > 1
  ) x;
  IF v_grup_po <> 0 THEN
    RAISE EXCEPTION 'kontrola: po scaleniu zostało % grup z powtórzoną tablicą', v_grup_po;
  END IF;

  -- 2. Żadne zlecenie ani wpis przechowalni nie wskazuje na nieistniejący pojazd.
  SELECT count(*) INTO v_osierocone FROM public.workshop_orders o
   WHERE o.vehicle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.workshop_vehicles v WHERE v.id = o.vehicle_id);
  IF v_osierocone <> 0 THEN
    RAISE EXCEPTION 'kontrola: % zleceń wskazuje na skasowany pojazd', v_osierocone;
  END IF;

  SELECT count(*) INTO v_osierocone FROM public.workshop_tire_storage t
   WHERE t.vehicle_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.workshop_vehicles v WHERE v.id = t.vehicle_id);
  IF v_osierocone <> 0 THEN
    RAISE EXCEPTION 'kontrola: % wpisów przechowalni wskazuje na skasowany pojazd', v_osierocone;
  END IF;

  -- 3. KONTROLA ODWROTNA — po scaleniu MUSI zostać historia, a nie pustka.
  --    Zestaw samych „nic nie osierocone" wypadłby zielono także wtedy,
  --    gdyby migracja skasowała wszystkie zlecenia.
  SELECT count(*) INTO v_zlecen_po FROM public.workshop_orders WHERE vehicle_id IS NOT NULL;
  IF v_zlecen_po < 30 THEN
    RAISE EXCEPTION 'kontrola: zleceń z pojazdem zostało tylko % — przed scaleniem było ich 42 w samych grupach zduplikowanych', v_zlecen_po;
  END IF;

  SELECT count(*) INTO v_opon_po FROM public.workshop_tire_storage WHERE vehicle_id IS NOT NULL;

  RAISE NOTICE 'Scalenie przeszło. Pojazdów: %. Zleceń z pojazdem: %. Wpisów przechowalni z pojazdem: %.',
    (SELECT count(*) FROM public.workshop_vehicles), v_zlecen_po, v_opon_po;
END;
$kontrola$;

COMMIT;

-- =====================================================================
-- SCALANIE ZDUBLOWANYCH POJAZDÓW
--
-- Uruchamiane RĘCZNIE (edytor SQL Supabase). To nie jest migracja — zmienia dane,
-- nie schemat, i nigdy nie może wykonać się samo przy wdrożeniu.
--
-- SKĄD DUPLIKATY: wyszukiwarka pojazdu przy nowym zleceniu porównywała numer
-- rejestracyjny dosłownie, więc „wy996eu" nie znajdowało auta zapisanego jako
-- „WY 996EU" i użytkownik zakładał nowy rekord. Historia napraw rozjeżdżała się
-- wtedy między dwa auta. Sama wyszukiwarka jest już poprawiona.
--
-- CZEGO SKRYPT NIE RUSZA:
--   • par o RÓŻNYCH numerach VIN — to mogą być dwa różne auta na tych samych tablicach,
--   • par z DWOMA RÓŻNYMI właścicielami — auto może zmienić właściciela i to nie jest
--     duplikat, tylko normalne zdarzenie; taką parę scala człowiek, świadomie.
--
-- Zostaje rekord z właścicielem (albo ten z największą liczbą zleceń), a zlecenia
-- z duplikatu są do niego przepinane.
-- =====================================================================

BEGIN;

-- Znormalizowany numer rejestracyjny: bez spacji, myślników i wielkości liter.
CREATE TEMP TABLE _plate AS
SELECT id,
       provider_id,
       upper(regexp_replace(coalesce(plate, ''), '[\s-]', '', 'g')) AS key,
       upper(regexp_replace(coalesce(vin, ''), '[\s-]', '', 'g'))   AS vin_key,
       owner_client_id,
       vin
FROM public.workshop_vehicles
WHERE provider_id = '664ed87b-a20f-457b-a9fa-97ca13dcae7c'
  AND coalesce(plate, '') <> '';

-- Grupy bezpieczne do scalenia: jeden numer rej., spójny VIN, najwyżej jeden właściciel.
CREATE TEMP TABLE _groups AS
SELECT key
FROM _plate
GROUP BY key
HAVING count(*) > 1
   AND count(DISTINCT nullif(vin_key, '')) <= 1
   AND count(DISTINCT owner_client_id) FILTER (WHERE owner_client_id IS NOT NULL) <= 1;

-- Rekord, który zostaje: najpierw ten z właścicielem, potem ten z największą liczbą zleceń.
CREATE TEMP TABLE _keep AS
SELECT DISTINCT ON (p.key) p.key, p.id
FROM _plate p
JOIN _groups g ON g.key = p.key
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt FROM public.workshop_orders o WHERE o.vehicle_id = p.id
) o ON true
ORDER BY p.key, (p.owner_client_id IS NOT NULL) DESC, o.cnt DESC, p.id;

-- Podgląd: sprawdź liczby, zanim zatwierdzisz.
SELECT (SELECT count(*) FROM _groups)                                              AS grup_do_scalenia,
       (SELECT count(*) FROM _plate p JOIN _groups g ON g.key = p.key
          WHERE p.id NOT IN (SELECT id FROM _keep))                                AS rekordow_do_usuniecia,
       (SELECT count(*) FROM public.workshop_orders o
          WHERE o.vehicle_id IN (SELECT p.id FROM _plate p JOIN _groups g ON g.key = p.key
                                   WHERE p.id NOT IN (SELECT id FROM _keep)))      AS zlecen_do_przeniesienia;

-- 1. Zlecenia z duplikatów trafiają do rekordu, który zostaje.
UPDATE public.workshop_orders o
   SET vehicle_id = k.id
  FROM _plate p
  JOIN _groups g ON g.key = p.key
  JOIN _keep k   ON k.key = p.key
 WHERE o.vehicle_id = p.id
   AND p.id <> k.id;

-- 2. Uzupełnienie VIN-u, jeśli rekord docelowy go nie miał, a duplikat miał.
UPDATE public.workshop_vehicles v
   SET vin = src.vin
  FROM _keep k
  JOIN _plate src ON src.key = k.key AND src.id <> k.id AND coalesce(src.vin, '') <> ''
 WHERE v.id = k.id
   AND coalesce(v.vin, '') = '';

-- 3. Usunięcie pustych już duplikatów.
DELETE FROM public.workshop_vehicles v
 USING _plate p
  JOIN _groups g ON g.key = p.key
  JOIN _keep k   ON k.key = p.key
 WHERE v.id = p.id
   AND p.id <> k.id
   AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.vehicle_id = v.id);

-- Zgadza się? COMMIT. Nie? ROLLBACK.
COMMIT;

-- =====================================================================
-- DO RĘCZNEJ DECYZJI (skrypt ich nie tknął) — auta z dwoma właścicielami:
--   KWA57168, WU3111L, WY5257K
-- Jeśli to zmiana właściciela, zostaw dwa rekordy albo przepnij historię świadomie.
-- =====================================================================

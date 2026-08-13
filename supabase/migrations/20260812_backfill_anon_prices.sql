-- Zasilenie wspolnej bazy cen historia zlecen.
--
-- Zapis do wspolnej bazy dodano pozniej niz sam modul, wiec kilkaset realnych
-- wycen nigdy tam nie trafilo. Przepisujemy je jednorazowo, zeby wycena miala
-- z czego liczyc widelki od pierwszego dnia.
--
-- ZASADA: tylko pozycje POWIAZANE Z AUTEM (marka + model). Cena bez pojazdu
-- jest nieporownywalna i tylko rozmywa wynik.
--
-- ANONIMIZACJA: przepisujemy nazwe uslugi, cene, dane techniczne auta i miasto.
-- NIE zapisujemy: warsztatu, klienta, numeru zlecenia ani VIN — VIN identyfikuje
-- konkretny samochod i jego wlasciciela, wiec nie ma go we wspolnej bazie.
--
-- COFNIECIE: wszystkie wiersze dostaja created_month = 'BACKFILL', wiec
--   DELETE FROM anonymous_service_prices WHERE created_month = 'BACKFILL';
-- usuwa dokladnie to, co dodala ta migracja.

INSERT INTO public.anonymous_service_prices (
  service_name_normalized, vehicle_brand, vehicle_model, engine_capacity,
  vehicle_year, fuel_type, city, industry, price_net, price_gross, created_month, created_at
)
SELECT
  lower(regexp_replace(trim(i.name), '\s+', ' ', 'g')),
  v.brand, v.model, v.engine_capacity_cm3, v.year, v.fuel_type,
  c.city, 'warsztat',
  i.unit_price_net, i.unit_price_gross,
  'BACKFILL',
  COALESCE(i.created_at, now())
FROM workshop_order_items i
JOIN workshop_orders o ON o.id = i.order_id
JOIN workshop_vehicles v ON v.id = o.vehicle_id
LEFT JOIN workshop_clients c ON c.id = o.client_id
WHERE i.item_type IN ('service', 'task')
  AND i.unit_price_gross > 0
  AND v.brand IS NOT NULL AND trim(v.brand) <> ''
  AND v.model IS NOT NULL AND trim(v.model) <> ''
  -- odsiew smieci z testow ("asd", "qwe", "test123"...)
  AND length(regexp_replace(lower(trim(i.name)), '[^a-z0-9]', '', 'g')) >= 4
  AND regexp_replace(lower(trim(i.name)), '[^a-z0-9]', '', 'g') !~ '^(asd|qwe|zxc|test|aaa|xxx|abc|123)+$'
  -- nie duplikujemy tego, co juz w bazie jest
  AND NOT EXISTS (
    SELECT 1 FROM public.anonymous_service_prices a
    WHERE a.service_name_normalized = lower(regexp_replace(trim(i.name), '\s+', ' ', 'g'))
      AND a.price_gross = i.unit_price_gross
      AND COALESCE(a.vehicle_brand, '') = COALESCE(v.brand, '')
      AND COALESCE(a.vehicle_model, '') = COALESCE(v.model, '')
  );

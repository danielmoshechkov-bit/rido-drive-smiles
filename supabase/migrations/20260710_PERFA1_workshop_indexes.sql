-- =====================================================================
-- PERF A1: indeksy pod ścieżkę zmiany statusu zlecenia warsztatowego
-- ---------------------------------------------------------------------
-- Triggery mostu warsztat -> klient (20260613120000_workshop_client_history_bridge.sql)
-- robiły pełne skany: client_vehicles / client_vehicle_service_history /
-- client_vehicle_ownership_requests nie miały ŻADNEGO indeksu, a porównania
-- po tablicy rejestracyjnej używają wyrażenia upper(btrim(coalesce(...,''))),
-- więc potrzebne są indeksy funkcyjne o IDENTYCZNYM wyrażeniu.
-- Logika triggerów pozostaje bez zmian — indeksy tylko je przyspieszają.
-- =====================================================================

-- --- Most warsztat -> klient: trigger workshop_sync_service_history (UPDATE statusu)
CREATE INDEX IF NOT EXISTS idx_client_vehicles_workshop_vehicle_id
  ON public.client_vehicles (workshop_vehicle_id);

-- Wyrażenie identyczne jak w triggerach (linie 82/91/156 migracji mostu).
CREATE INDEX IF NOT EXISTS idx_client_vehicles_plate_norm
  ON public.client_vehicles (upper(btrim(coalesce(plate_number, ''))));

-- Pod NOT EXISTS (h.client_vehicle_id = cv.id AND h.workshop_order_id = NEW.id)
CREATE INDEX IF NOT EXISTS idx_cv_service_history_vehicle_order
  ON public.client_vehicle_service_history (client_vehicle_id, workshop_order_id);

-- --- Most warsztat -> klient: trigger workshop_create_ownership_request (INSERT zlecenia)
CREATE INDEX IF NOT EXISTS idx_cv_ownership_requests_plate_norm
  ON public.client_vehicle_ownership_requests (upper(btrim(coalesce(plate_number, ''))));

CREATE INDEX IF NOT EXISTS idx_cv_ownership_requests_phone
  ON public.client_vehicle_ownership_requests (phone);

-- --- Historia statusów: filtr RLS + odczyty per zlecenie robiły Seq Scan
CREATE INDEX IF NOT EXISTS idx_workshop_order_status_history_order
  ON public.workshop_order_status_history (order_id);

-- --- workshop_orders: brakujące indeksy FK i filtrów list
CREATE INDEX IF NOT EXISTS idx_workshop_orders_status_id
  ON public.workshop_orders (status_id);

CREATE INDEX IF NOT EXISTS idx_workshop_orders_created_at
  ON public.workshop_orders (created_at);

CREATE INDEX IF NOT EXISTS idx_workshop_orders_station_id
  ON public.workshop_orders (station_id);

-- Główne zapytanie listy: WHERE provider_id = ... ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_workshop_orders_provider_created
  ON public.workshop_orders (provider_id, created_at DESC);

-- --- pozostałe brakujące FK
CREATE INDEX IF NOT EXISTS idx_workshop_order_statuses_provider
  ON public.workshop_order_statuses (provider_id);

CREATE INDEX IF NOT EXISTS idx_workshop_vehicles_owner_client
  ON public.workshop_vehicles (owner_client_id);

-- Odśwież statystyki plannera, żeby nowe indeksy były używane od razu.
ANALYZE public.client_vehicles;
ANALYZE public.client_vehicle_service_history;
ANALYZE public.client_vehicle_ownership_requests;
ANALYZE public.workshop_orders;
ANALYZE public.workshop_order_status_history;

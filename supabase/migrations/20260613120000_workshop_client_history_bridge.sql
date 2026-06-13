-- =====================================================================
-- Workshop  ->  Client repair-history bridge
-- ---------------------------------------------------------------------
-- Completes the partially-built "historia napraw" feature whose tables
-- were created in 20260326073925 (client_vehicles,
-- client_vehicle_service_history, client_vehicle_ownership_requests)
-- but which never had backend wiring.
--
-- It adds the missing links:
--   A) when a workshop order references a vehicle (plate) + a client
--      (phone), create a pending ownership request keyed by phone so the
--      client is prompted to claim the car and see its history;
--   B) when an order is completed, append it to the verified client's
--      vehicle service history;
--   C) when a client verifies ownership (or manually adds a verified
--      vehicle), backfill all already-completed workshop orders so past
--      repairs show up immediately.
--
-- All functions are SECURITY DEFINER so they may write across RLS
-- (the writes are derived from server-side data, not user input).
-- =====================================================================

-- Normalize a Polish phone number to its last 9 significant digits, used
-- as the join key between workshop_clients.phone and a user account's
-- phone (which may be stored as +48..., 0048..., 0..., or local).
CREATE OR REPLACE FUNCTION public.normalize_pl_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '');
$$;

-- Statuses that mean "repair is done" across the workshop flow.
CREATE OR REPLACE FUNCTION public.workshop_done_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'Naprawione',
    'Gotowy do odbioru', 'Gotowe do odbioru',
    'Wydany', 'Wydane',
    'Zakończone', 'Zakończono',
    'Zamknięte'
  ];
$$;

-- ---------------------------------------------------------------------
-- A) Create an ownership request when a new order pairs a vehicle (plate)
--    with a client (phone). The client sees it under /cp -> My Vehicles.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workshop_create_ownership_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          workshop_vehicles%ROWTYPE;
  c_phone    text;
  v_phone    text;
BEGIN
  IF NEW.vehicle_id IS NULL OR NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v FROM workshop_vehicles WHERE id = NEW.vehicle_id;
  SELECT phone INTO c_phone FROM workshop_clients WHERE id = NEW.client_id;

  v_phone := public.normalize_pl_phone(c_phone);

  -- Need both a matchable phone and a plate.
  IF v_phone IS NULL OR v.plate IS NULL OR btrim(v.plate) = '' THEN
    RETURN NEW;
  END IF;

  -- Skip if there is already a pending/verified request for this phone+plate.
  IF EXISTS (
    SELECT 1 FROM client_vehicle_ownership_requests r
    WHERE r.phone = v_phone
      AND upper(btrim(coalesce(r.plate_number, ''))) = upper(btrim(v.plate))
      AND r.status IN ('pending', 'verified')
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip if some user already has this plate as a verified, unsold vehicle.
  IF EXISTS (
    SELECT 1 FROM client_vehicles cv
    WHERE upper(btrim(coalesce(cv.plate_number, ''))) = upper(btrim(v.plate))
      AND cv.is_verified = true
      AND coalesce(cv.is_sold, false) = false
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO client_vehicle_ownership_requests
    (phone, plate_number, vin, make, model, year, engine_capacity, workshop_vehicle_id, status)
  VALUES
    (v_phone, v.plate, v.vin, v.brand, v.model, v.year,
     CASE WHEN v.engine_capacity_cm3 IS NOT NULL THEN v.engine_capacity_cm3::text ELSE NULL END,
     NEW.vehicle_id, 'pending');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workshop_create_ownership_request ON workshop_orders;
CREATE TRIGGER trg_workshop_create_ownership_request
  AFTER INSERT ON workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.workshop_create_ownership_request();

-- ---------------------------------------------------------------------
-- B) When an order is completed, append it to the matching verified
--    client's vehicle service history (idempotent per workshop_order_id).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workshop_sync_service_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plate text;
  v_name  text;
  v_date  date;
BEGIN
  -- Only act when the order is in a completed state.
  IF NEW.status_name IS NULL OR NOT (NEW.status_name = ANY(public.workshop_done_statuses())) THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire when the status actually changed into "done"
  -- (avoids re-running on unrelated column updates).
  IF TG_OP = 'UPDATE' AND OLD.status_name IS NOT DISTINCT FROM NEW.status_name THEN
    RETURN NEW;
  END IF;

  IF NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT plate INTO v_plate FROM workshop_vehicles WHERE id = NEW.vehicle_id;
  SELECT company_name INTO v_name FROM service_providers WHERE id = NEW.provider_id;
  v_date := COALESCE(NEW.completed_at, NEW.repaired_at, NEW.updated_at, now())::date;

  INSERT INTO client_vehicle_service_history
    (client_vehicle_id, service_date, mileage, description, cost, workshop_name, workshop_order_id)
  SELECT cv.id, v_date, NEW.mileage, NEW.description, NEW.total_gross, v_name, NEW.id
  FROM client_vehicles cv
  WHERE cv.is_verified = true
    AND coalesce(cv.is_sold, false) = false
    AND (
      cv.workshop_vehicle_id = NEW.vehicle_id
      OR (v_plate IS NOT NULL AND upper(btrim(coalesce(cv.plate_number, ''))) = upper(btrim(v_plate)))
    )
    AND NOT EXISTS (
      SELECT 1 FROM client_vehicle_service_history h
      WHERE h.client_vehicle_id = cv.id AND h.workshop_order_id = NEW.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workshop_sync_service_history ON workshop_orders;
CREATE TRIGGER trg_workshop_sync_service_history
  AFTER INSERT OR UPDATE OF status_name ON workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.workshop_sync_service_history();

-- ---------------------------------------------------------------------
-- C) When a verified client vehicle is created (ownership confirmed or a
--    manual verified add), backfill all already-completed workshop orders
--    for that vehicle so past repairs appear right away.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_vehicle_backfill_service_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_verified, false) = false THEN
    RETURN NEW;
  END IF;
  -- On UPDATE only backfill when the vehicle JUST became verified
  -- (covers manual add -> later VIN verification). Already-verified rows
  -- are skipped; the NOT EXISTS guard below also keeps it idempotent.
  IF TG_OP = 'UPDATE' AND coalesce(OLD.is_verified, false) = true THEN
    RETURN NEW;
  END IF;

  INSERT INTO client_vehicle_service_history
    (client_vehicle_id, service_date, mileage, description, cost, workshop_name, workshop_order_id)
  SELECT NEW.id,
         COALESCE(o.completed_at, o.repaired_at, o.updated_at, o.created_at, now())::date,
         o.mileage, o.description, o.total_gross, sp.company_name, o.id
  FROM workshop_orders o
  JOIN workshop_vehicles wv ON wv.id = o.vehicle_id
  LEFT JOIN service_providers sp ON sp.id = o.provider_id
  WHERE o.status_name = ANY(public.workshop_done_statuses())
    AND (
      (NEW.workshop_vehicle_id IS NOT NULL AND o.vehicle_id = NEW.workshop_vehicle_id)
      OR (NEW.plate_number IS NOT NULL
          AND upper(btrim(coalesce(wv.plate, ''))) = upper(btrim(NEW.plate_number)))
    )
    AND NOT EXISTS (
      SELECT 1 FROM client_vehicle_service_history h
      WHERE h.client_vehicle_id = NEW.id AND h.workshop_order_id = o.id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_vehicle_backfill_service_history ON client_vehicles;
CREATE TRIGGER trg_client_vehicle_backfill_service_history
  AFTER INSERT OR UPDATE OF is_verified ON client_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.client_vehicle_backfill_service_history();

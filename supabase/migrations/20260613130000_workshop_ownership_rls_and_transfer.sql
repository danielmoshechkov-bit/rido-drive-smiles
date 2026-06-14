-- =====================================================================
-- Ownership requests: privacy (RLS) + owner-change (sale) detection
-- ---------------------------------------------------------------------
-- 1) Fixes a data leak: the ownership-requests SELECT/UPDATE policies were
--    USING (true), so ANY authenticated user (any portal) could read every
--    phone+plate in the system. Scope them to the caller's own phone.
-- 2) Lets a workshop order with the SAME plate but a DIFFERENT phone than
--    the current owner create a fresh ownership request, so the new owner
--    can claim the car (VIN-verified, in the edge function) and trigger a
--    sale transfer. The actual transfer + old-owner email lives in the
--    client-verify-vehicle-ownership edge function.
-- =====================================================================

-- Normalized (last 9 digits) phone of the currently authenticated user.
-- SECURITY DEFINER so an RLS policy may read auth.users.
CREATE OR REPLACE FUNCTION public.current_user_pl_phone()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_pl_phone(coalesce(u.raw_user_meta_data->>'phone', u.phone))
  FROM auth.users u
  WHERE u.id = auth.uid();
$$;

-- ---- Scope ownership-request visibility to the caller's own phone -----
DROP POLICY IF EXISTS "Users can view ownership requests by their phone" ON client_vehicle_ownership_requests;
CREATE POLICY "Users can view ownership requests by their phone"
  ON client_vehicle_ownership_requests FOR SELECT TO authenticated
  USING (phone = public.current_user_pl_phone());

DROP POLICY IF EXISTS "Users can update ownership requests" ON client_vehicle_ownership_requests;
CREATE POLICY "Users can update own ownership requests"
  ON client_vehicle_ownership_requests FOR UPDATE TO authenticated
  USING (phone = public.current_user_pl_phone());

-- ---- Owner-change aware request creation ------------------------------
CREATE OR REPLACE FUNCTION public.workshop_create_ownership_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v        workshop_vehicles%ROWTYPE;
  c_phone  text;
  v_phone  text;
BEGIN
  IF NEW.vehicle_id IS NULL OR NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v FROM workshop_vehicles WHERE id = NEW.vehicle_id;
  SELECT phone INTO c_phone FROM workshop_clients WHERE id = NEW.client_id;

  v_phone := public.normalize_pl_phone(c_phone);

  IF v_phone IS NULL OR v.plate IS NULL OR btrim(v.plate) = '' THEN
    RETURN NEW;
  END IF;

  -- Already an active/verified request for this phone+plate? skip.
  IF EXISTS (
    SELECT 1 FROM client_vehicle_ownership_requests r
    WHERE r.phone = v_phone
      AND upper(btrim(coalesce(r.plate_number, ''))) = upper(btrim(v.plate))
      AND r.status IN ('pending', 'verified')
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip ONLY if THIS phone's owner already has the plate verified (they
  -- already own it). A different phone on the same plate is a potential
  -- sale -> still create a request so the new owner can claim/transfer it.
  IF EXISTS (
    SELECT 1 FROM client_vehicles cv
    JOIN auth.users u ON u.id = cv.user_id
    WHERE upper(btrim(coalesce(cv.plate_number, ''))) = upper(btrim(v.plate))
      AND cv.is_verified = true
      AND coalesce(cv.is_sold, false) = false
      AND public.normalize_pl_phone(coalesce(u.raw_user_meta_data->>'phone', u.phone)) = v_phone
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

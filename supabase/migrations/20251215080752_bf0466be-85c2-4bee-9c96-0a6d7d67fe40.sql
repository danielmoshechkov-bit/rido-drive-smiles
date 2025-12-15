-- Fix RLS infinite recursion with SECURITY DEFINER function

-- 1. Create SECURITY DEFINER function for driver vehicle access check
CREATE OR REPLACE FUNCTION public.driver_has_vehicle_access(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dva.vehicle_id = p_vehicle_id 
    AND dau.user_id = auth.uid() 
    AND dva.status = 'active'
  )
$$;

-- 2. Create helper function to get driver's city_id
CREATE OR REPLACE FUNCTION public.get_driver_city_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT city_id FROM driver_app_users WHERE user_id = auth.uid() LIMIT 1),
    (SELECT d.city_id FROM drivers d 
     JOIN driver_app_users dau ON dau.driver_id = d.id 
     WHERE dau.user_id = auth.uid() LIMIT 1)
  )
$$;

-- 3. Drop problematic policies that cause recursion
DROP POLICY IF EXISTS "Drivers can insert their own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Drivers can update their own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Drivers can insert inspections for their vehicles" ON vehicle_inspections;
DROP POLICY IF EXISTS "Drivers can view inspections for their vehicles" ON vehicle_inspections;
DROP POLICY IF EXISTS "Drivers can insert policies for their vehicles" ON vehicle_policies;
DROP POLICY IF EXISTS "Drivers can view policies for their vehicles" ON vehicle_policies;
DROP POLICY IF EXISTS "Drivers can insert services for their vehicles" ON vehicle_services;
DROP POLICY IF EXISTS "Drivers can view services for their vehicles" ON vehicle_services;

-- 4. Recreate vehicle policies with SECURITY DEFINER function
CREATE POLICY "Drivers can insert own vehicles"
ON vehicles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR (fleet_id IS NULL AND city_id = get_driver_city_id())
);

CREATE POLICY "Drivers can update own vehicles"
ON vehicles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR driver_has_vehicle_access(id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR driver_has_vehicle_access(id)
);

CREATE POLICY "Drivers can view own vehicles"
ON vehicles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR driver_has_vehicle_access(id)
);

-- 5. Recreate vehicle_inspections policies
CREATE POLICY "Drivers can insert own vehicle inspections"
ON vehicle_inspections
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR driver_has_vehicle_access(vehicle_id)
);

CREATE POLICY "Drivers can view own vehicle inspections"
ON vehicle_inspections
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR driver_has_vehicle_access(vehicle_id)
);

-- 6. Recreate vehicle_policies policies
CREATE POLICY "Drivers can insert own vehicle policies"
ON vehicle_policies
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR driver_has_vehicle_access(vehicle_id)
);

CREATE POLICY "Drivers can view own vehicle policies"
ON vehicle_policies
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR driver_has_vehicle_access(vehicle_id)
);

-- 7. Recreate vehicle_services policies
CREATE POLICY "Drivers can insert own vehicle services"
ON vehicle_services
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR driver_has_vehicle_access(vehicle_id)
);

CREATE POLICY "Drivers can view own vehicle services"
ON vehicle_services
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR driver_has_vehicle_access(vehicle_id)
);
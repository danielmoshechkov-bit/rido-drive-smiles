-- 1. Update SELECT policy for drivers table to allow fleet users to see their fleet drivers
DROP POLICY IF EXISTS "Admin and fleet users can view drivers" ON public.drivers;

CREATE POLICY "Admin and fleet users can view drivers"
ON public.drivers
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM driver_vehicle_assignments dva
    JOIN vehicles v ON dva.vehicle_id = v.id
    WHERE dva.driver_id = drivers.id
      AND dva.status = 'active'
      AND v.fleet_id = get_user_fleet_id(auth.uid())
  )
);

-- 2. Ensure only admins can UPDATE drivers table
-- Check if there's a policy allowing fleet users to update
DROP POLICY IF EXISTS "Fleet users can update drivers" ON public.drivers;

-- The "Admin can manage drivers" policy should handle UPDATE with proper restrictions
-- If it doesn't exist, we ensure it's properly set
DROP POLICY IF EXISTS "Admin can manage drivers UPDATE" ON public.drivers;

CREATE POLICY "Admin can manage drivers UPDATE"
ON public.drivers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Ensure only admins can manage driver_platform_ids
DROP POLICY IF EXISTS "Admins can manage platform IDs" ON public.driver_platform_ids;

CREATE POLICY "Admins can manage platform IDs"
ON public.driver_platform_ids
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
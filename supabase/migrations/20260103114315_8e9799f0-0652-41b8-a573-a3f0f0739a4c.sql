-- Drop existing conflicting INSERT policies
DROP POLICY IF EXISTS "Drivers can insert own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Fleet users can insert vehicles to their fleet" ON public.vehicles;

-- Create single consolidated INSERT policy
CREATE POLICY "Users can insert vehicles" ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  -- Admins can insert any vehicle
  has_role(auth.uid(), 'admin'::app_role) 
  OR 
  -- Fleet users can insert vehicles to their fleet
  (fleet_id IS NOT NULL AND fleet_id = get_user_fleet_id(auth.uid()))
  OR 
  -- Drivers can insert vehicles without fleet (own vehicles)
  (fleet_id IS NULL AND is_driver_user())
);
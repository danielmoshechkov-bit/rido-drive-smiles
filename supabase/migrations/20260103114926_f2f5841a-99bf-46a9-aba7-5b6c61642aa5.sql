-- Add SELECT policy allowing drivers to view vehicles without fleet
-- This fixes the RLS error when drivers insert vehicles with .select("id")
CREATE POLICY "Drivers can view vehicles without fleet" ON public.vehicles
FOR SELECT TO authenticated
USING (
  fleet_id IS NULL AND is_driver_user()
);
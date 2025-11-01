-- Fix: Remove infinite recursion in driver_vehicle_assignments RLS policies
-- Problem: Policy references vehicles table, which references driver_vehicle_assignments, creating a loop

-- Drop the problematic policy
DROP POLICY IF EXISTS "Fleet users can manage their vehicle assignments" ON public.driver_vehicle_assignments;

-- Recreate policy WITHOUT referencing vehicles table
-- Use only fleet_id from driver_vehicle_assignments itself to break the recursion
CREATE POLICY "Fleet users can manage their vehicle assignments"
ON public.driver_vehicle_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR driver_vehicle_assignments.fleet_id = public.get_user_fleet_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR driver_vehicle_assignments.fleet_id = public.get_user_fleet_id(auth.uid())
);
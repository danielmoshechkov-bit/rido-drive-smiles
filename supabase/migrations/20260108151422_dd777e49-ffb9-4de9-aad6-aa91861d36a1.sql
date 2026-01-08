-- Allow fleet users to update drivers in their fleet
CREATE POLICY "Fleet users can update their drivers"
ON drivers
FOR UPDATE
TO authenticated
USING (fleet_id = get_user_fleet_id(auth.uid()))
WITH CHECK (fleet_id = get_user_fleet_id(auth.uid()));
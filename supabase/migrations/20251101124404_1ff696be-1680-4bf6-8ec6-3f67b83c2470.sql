-- Allow drivers to view their assigned vehicles (both active and historical)
CREATE POLICY "Drivers can view their assigned vehicles"
ON vehicles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT vehicle_id 
    FROM driver_vehicle_assignments
    WHERE driver_id IN (
      SELECT driver_id 
      FROM driver_app_users 
      WHERE user_id = auth.uid()
    )
  )
);
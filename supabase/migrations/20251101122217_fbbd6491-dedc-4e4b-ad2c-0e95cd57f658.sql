-- Enable drivers to view their own vehicle assignments
CREATE POLICY "Drivers can view their vehicle assignments"
ON driver_vehicle_assignments
FOR SELECT
TO authenticated
USING (
  driver_id IN (
    SELECT driver_id 
    FROM driver_app_users 
    WHERE user_id = auth.uid()
  )
);
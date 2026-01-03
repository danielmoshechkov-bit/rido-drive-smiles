-- Make fleet_id nullable in vehicle_listings so drivers can list their own cars
ALTER TABLE vehicle_listings ALTER COLUMN fleet_id DROP NOT NULL;

-- Add RLS policy for drivers to manage their own vehicle listings
CREATE POLICY "Drivers can manage own vehicle listings" ON vehicle_listings
FOR ALL TO authenticated
USING (
  fleet_id IS NULL AND 
  vehicle_id IN (
    SELECT v.id FROM vehicles v 
    JOIN driver_vehicle_assignments dva ON dva.vehicle_id = v.id
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE v.fleet_id IS NULL 
    AND dva.status = 'active'
    AND dau.user_id = auth.uid()
  )
)
WITH CHECK (
  fleet_id IS NULL AND 
  vehicle_id IN (
    SELECT v.id FROM vehicles v 
    JOIN driver_vehicle_assignments dva ON dva.vehicle_id = v.id
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE v.fleet_id IS NULL 
    AND dva.status = 'active'
    AND dau.user_id = auth.uid()
  )
);
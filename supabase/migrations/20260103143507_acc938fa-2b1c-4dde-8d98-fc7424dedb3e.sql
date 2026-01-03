-- Polityka DELETE dla vehicles - kierowca może usunąć własne auta (fleet_id IS NULL)
CREATE POLICY "Drivers can delete own vehicles"
ON public.vehicles FOR DELETE
TO authenticated
USING (
  (fleet_id IS NULL) AND driver_has_vehicle_access(id)
);

-- Polityka DELETE dla driver_vehicle_assignments
CREATE POLICY "Drivers can delete own vehicle assignments"
ON public.driver_vehicle_assignments FOR DELETE
TO authenticated
USING (
  driver_id IN (
    SELECT dau.driver_id FROM driver_app_users dau 
    WHERE dau.user_id = auth.uid()
  )
);
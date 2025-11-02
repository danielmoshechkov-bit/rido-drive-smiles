-- Fix RLS for settlements - allow drivers to see their own settlements
DROP POLICY IF EXISTS "Drivers can view their own settlements" ON settlements;

CREATE POLICY "Drivers can view their own settlements"
ON settlements
FOR SELECT
TO authenticated
USING (
  driver_id IN (
    SELECT driver_id 
    FROM driver_app_users 
    WHERE user_id = auth.uid()
  )
);
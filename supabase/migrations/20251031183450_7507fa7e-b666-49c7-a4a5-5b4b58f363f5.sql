-- Allow drivers to view their own settlements
CREATE POLICY "Drivers can view own settlements"
ON public.settlements 
FOR SELECT
USING (
  driver_id IN (
    SELECT driver_id 
    FROM driver_app_users 
    WHERE user_id = auth.uid()
  )
);
-- Fix 1: Add 'b2b' to allowed payment methods
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_payment_method_check;
ALTER TABLE drivers ADD CONSTRAINT drivers_payment_method_check 
  CHECK (payment_method = ANY (ARRAY['transfer'::text, 'cash'::text, 'b2b'::text]));

-- Fix 2: Allow fleet users to remove drivers from fleet (set fleet_id to NULL)
DROP POLICY IF EXISTS "Fleet users can update their drivers" ON drivers;

CREATE POLICY "Fleet users can update their drivers"
ON drivers
FOR UPDATE
TO authenticated
USING (fleet_id = get_user_fleet_id(auth.uid()))
WITH CHECK (
  fleet_id = get_user_fleet_id(auth.uid()) OR fleet_id IS NULL
);
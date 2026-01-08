-- Add RLS policy for fleet managers to view their drivers' fuel transactions
CREATE POLICY "Fleet managers can view their drivers fuel transactions"
ON fuel_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM drivers d
    JOIN user_roles ur ON ur.fleet_id = d.fleet_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('fleet_settlement', 'fleet_rental')
      AND ltrim(fuel_transactions.card_number, '0') = ltrim(d.fuel_card_number, '0')
  )
);
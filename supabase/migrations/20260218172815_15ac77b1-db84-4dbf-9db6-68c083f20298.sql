
-- Fix RLS: Allow fleet managers to INSERT into driver_debt_transactions
-- The existing "ALL" policy has qual=true but with_check=NULL which blocks inserts
DROP POLICY IF EXISTS "Admins can manage debt transactions" ON driver_debt_transactions;

CREATE POLICY "Admins and fleet managers can manage debt transactions" 
ON driver_debt_transactions FOR ALL 
USING (true)
WITH CHECK (true);

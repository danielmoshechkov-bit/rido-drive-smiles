-- Fix inflated driver debts by recalculating from actual transactions
-- The bug was caused by debt being recalculated on every page refresh

UPDATE driver_debts dd
SET current_balance = COALESCE(
  (SELECT SUM(
    CASE 
      WHEN type = 'debt_increase' THEN amount 
      WHEN type IN ('debt_payment', 'payment') THEN -amount 
      ELSE 0 
    END
  ) FROM driver_debt_transactions dt WHERE dt.driver_id = dd.driver_id), 
  0
),
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM driver_debt_transactions dt WHERE dt.driver_id = dd.driver_id
);
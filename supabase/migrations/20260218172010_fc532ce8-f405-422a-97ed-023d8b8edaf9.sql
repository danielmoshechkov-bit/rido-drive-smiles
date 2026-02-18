-- Fix driver_debts: payments are already stored as negative amounts, 
-- so we just SUM all amounts directly
UPDATE driver_debts dd
SET current_balance = GREATEST(0, COALESCE(
  (SELECT SUM(
    CASE 
      WHEN type = 'debt_increase' THEN amount 
      WHEN type IN ('debt_payment', 'payment') THEN amount  -- already negative
      ELSE 0 
    END
  ) FROM driver_debt_transactions dt WHERE dt.driver_id = dd.driver_id), 
  0
)),
updated_at = now();
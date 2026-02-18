-- Recalculate ALL driver_debts.current_balance from actual transaction history
-- This fixes balances that were corrupted when payments failed to save as transactions (RLS bug)
UPDATE driver_debts dd
SET current_balance = COALESCE(
  (SELECT SUM(
    CASE 
      WHEN type = 'debt_increase' THEN amount
      WHEN type IN ('debt_payment', 'payment') THEN amount  -- payment amounts are already negative
      ELSE 0 
    END
  ) FROM driver_debt_transactions dt WHERE dt.driver_id = dd.driver_id), 
  0
),
updated_at = now();

-- Also update settlements debt_after to match corrected current_balance
-- so the table doesn't show stale values
UPDATE settlements s
SET debt_after = dd.current_balance
FROM driver_debts dd
WHERE s.driver_id = dd.driver_id
  AND s.debt_after IS NOT NULL
  AND s.period_from = (
    SELECT MAX(s2.period_from) FROM settlements s2 
    WHERE s2.driver_id = s.driver_id AND s2.debt_after IS NOT NULL
  );
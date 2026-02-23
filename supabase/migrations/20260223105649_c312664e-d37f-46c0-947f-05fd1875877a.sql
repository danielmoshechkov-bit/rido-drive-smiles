-- Recalculate ALL driver_debts from transaction history (fixes manual payments that didn't save as transactions)
UPDATE driver_debts dd
SET current_balance = COALESCE(
  (SELECT SUM(
    CASE 
      WHEN type = 'debt_increase' THEN amount
      WHEN type IN ('debt_payment', 'payment') THEN amount
      ELSE 0 
    END
  ) FROM driver_debt_transactions dt WHERE dt.driver_id = dd.driver_id), 
  0
),
updated_at = now();

-- Ensure no negative balances
UPDATE driver_debts SET current_balance = 0 WHERE current_balance < 0;

-- Sync latest settlement debt_after with corrected driver_debts
UPDATE settlements s
SET debt_after = dd.current_balance
FROM driver_debts dd
WHERE s.driver_id = dd.driver_id
  AND s.debt_after IS NOT NULL
  AND s.id = (
    SELECT s2.id FROM settlements s2 
    WHERE s2.driver_id = s.driver_id AND s2.debt_after IS NOT NULL
    ORDER BY s2.period_from DESC LIMIT 1
  );
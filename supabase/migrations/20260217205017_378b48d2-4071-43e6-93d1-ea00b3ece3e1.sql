
-- Deduplicate driver_debt_transactions: keep only the earliest per unique combo
DELETE FROM driver_debt_transactions
WHERE id NOT IN (
  SELECT (array_agg(id ORDER BY created_at ASC))[1]
  FROM driver_debt_transactions
  GROUP BY driver_id, period_from, period_to, type, amount
);

-- Recalculate all driver_debts balances from clean transactions
UPDATE driver_debts dd
SET current_balance = COALESCE(sub.total, 0),
    updated_at = now()
FROM (
  SELECT driver_id, SUM(amount) as total
  FROM driver_debt_transactions
  GROUP BY driver_id
) sub
WHERE dd.driver_id = sub.driver_id;

-- Zero out any drivers with no remaining transactions
UPDATE driver_debts
SET current_balance = 0, updated_at = now()
WHERE driver_id NOT IN (SELECT DISTINCT driver_id FROM driver_debt_transactions);

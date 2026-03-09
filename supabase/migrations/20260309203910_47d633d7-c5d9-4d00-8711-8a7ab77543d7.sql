-- Fix duplicate debt transactions: keep only the first transaction per settlement_id
-- This prevents double-counting of debts when settlements are re-imported

-- Step 1: Delete duplicate debt transactions (keep the earliest one per settlement_id)
DELETE FROM driver_debt_transactions 
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY settlement_id, driver_id, type ORDER BY created_at ASC) as rn
    FROM driver_debt_transactions
    WHERE settlement_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Step 2: Recalculate all driver_debts balances from their transactions
-- This ensures balances are correct after removing duplicates
WITH recalculated AS (
  SELECT driver_id,
    GREATEST(0, SUM(
      CASE 
        WHEN type IN ('debt_increase', 'manual_add') THEN ABS(amount)
        ELSE -ABS(amount)
      END
    )) as correct_balance
  FROM driver_debt_transactions
  GROUP BY driver_id
)
UPDATE driver_debts dd
SET current_balance = COALESCE(r.correct_balance, 0),
    updated_at = now()
FROM recalculated r
WHERE dd.driver_id = r.driver_id
  AND dd.current_balance != r.correct_balance;

-- Step 3: Set balance to 0 for drivers with no transactions but have a debt record
UPDATE driver_debts 
SET current_balance = 0, updated_at = now()
WHERE driver_id NOT IN (SELECT DISTINCT driver_id FROM driver_debt_transactions)
  AND current_balance > 0;
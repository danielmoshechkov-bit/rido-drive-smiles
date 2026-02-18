
-- Fix: Remove orphaned system-generated debt transactions that don't match current settlements
-- Keep only: manual transactions (payment, debt_increase with manual descriptions)

-- Step 1: Delete system-generated debt transactions with no settlement_id that have auto-descriptions
DELETE FROM driver_debt_transactions 
WHERE settlement_id IS NULL 
AND (
  description LIKE 'Dług z okresu%' 
  OR description LIKE 'Spłata długu z okresu%'
  OR description LIKE 'Ujemne saldo%'
);

-- Step 2: Delete debt transactions whose settlement_id no longer exists in settlements
DELETE FROM driver_debt_transactions 
WHERE settlement_id IS NOT NULL
AND settlement_id NOT IN (SELECT id FROM settlements);

-- Step 3: Recalculate all driver debt balances from remaining transactions
UPDATE driver_debts dd
SET current_balance = COALESCE(sub.total, 0),
    updated_at = now()
FROM (
  SELECT driver_id,
    SUM(CASE 
      WHEN type IN ('debt_increase', 'manual_add') THEN ABS(amount)
      ELSE -ABS(amount)
    END) as total
  FROM driver_debt_transactions 
  GROUP BY driver_id
) sub
WHERE dd.driver_id = sub.driver_id;

-- Step 4: Set balance to 0 for drivers with no remaining transactions
UPDATE driver_debts 
SET current_balance = 0, updated_at = now()
WHERE driver_id NOT IN (SELECT DISTINCT driver_id FROM driver_debt_transactions);

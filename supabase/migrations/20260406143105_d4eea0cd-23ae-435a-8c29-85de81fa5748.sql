
-- Force re-deduplicate any remaining duplicate auto-transactions
-- (some may have had different settlement_ids preventing the unique index from catching them)
DELETE FROM driver_debt_transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY driver_id, period_from, period_to, debt_category, type
        ORDER BY created_at ASC
      ) AS rn
    FROM driver_debt_transactions
    WHERE type IN ('debt_increase', 'debt_payment')
  ) x WHERE rn > 1
);

-- Recalculate current_balance from clean ledger
UPDATE driver_debts dd
SET 
  current_balance = GREATEST(0, COALESCE((
    SELECT SUM(
      CASE 
        WHEN type IN ('debt_increase', 'manual_add') THEN ABS(amount)
        ELSE -ABS(amount)
      END
    )
    FROM driver_debt_transactions
    WHERE driver_id = dd.driver_id
  ), 0)),
  updated_at = NOW();

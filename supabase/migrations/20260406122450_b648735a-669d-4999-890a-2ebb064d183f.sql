
-- 1. Remove duplicate auto-transactions (keep oldest record per group)
DELETE FROM driver_debt_transactions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY driver_id, period_from, period_to, debt_category, type
        ORDER BY created_at ASC
      ) as rn
    FROM driver_debt_transactions
    WHERE type IN ('debt_increase', 'debt_payment')
  ) x WHERE rn > 1
);

-- 2. Add partial unique index protecting only auto-transactions
-- manual_add and payment types are NOT covered intentionally
CREATE UNIQUE INDEX IF NOT EXISTS unique_auto_debt_per_driver_period
ON driver_debt_transactions (driver_id, period_from, period_to, debt_category, type)
WHERE type IN ('debt_increase', 'debt_payment');

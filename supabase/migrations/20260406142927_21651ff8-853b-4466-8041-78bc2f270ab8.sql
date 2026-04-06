
-- 1. Usuń zduplikowane settlements (zostaw najnowszy rekord per kierowca+tydzień)
DELETE FROM settlements
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY driver_id, period_from, period_to
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) AS rn
    FROM settlements
  ) x WHERE rn > 1
);

-- 2. Usuń zduplikowane transakcje debt_increase/debt_payment (zostaw najstarszy rekord)
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

-- 3. Dodaj unique index na settlements zapobiegający przyszłym duplikatom
CREATE UNIQUE INDEX IF NOT EXISTS unique_settlement_per_driver_period
ON settlements (driver_id, period_from, period_to);

-- 4. Dodaj unique partial index na auto-transakcje długów
CREATE UNIQUE INDEX IF NOT EXISTS unique_auto_debt_tx_per_driver_period
ON driver_debt_transactions (driver_id, period_from, period_to, debt_category, type)
WHERE type IN ('debt_increase', 'debt_payment');

-- 5. Przelicz current_balance dla każdego kierowcy z transakcji (źródło prawdy)
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

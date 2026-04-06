-- Fix empty settlements (amounts={}) - carry debt from previous week
WITH ordered AS (
  SELECT 
    s.id,
    s.driver_id,
    s.period_from,
    s.amounts,
    s.net_amount,
    LAG(s.debt_after) OVER (
      PARTITION BY s.driver_id 
      ORDER BY s.period_from
    ) AS prev_debt_after
  FROM settlements s
),
to_fix AS (
  SELECT id, COALESCE(prev_debt_after, 0) AS correct_debt
  FROM ordered
  WHERE (amounts::text = '{}' OR amounts IS NULL) AND (net_amount = 0 OR net_amount IS NULL)
)
UPDATE settlements s
SET 
  debt_before = tf.correct_debt,
  debt_after = tf.correct_debt,
  debt_payment = 0,
  actual_payout = 0
FROM to_fix tf
WHERE s.id = tf.id;

-- Recalculate driver_debts from transaction ledger (source of truth)
UPDATE driver_debts dd
SET current_balance = GREATEST(0, COALESCE((
  SELECT SUM(CASE 
    WHEN type IN ('debt_increase','manual_add') THEN ABS(amount)
    ELSE -ABS(amount)
  END)
  FROM driver_debt_transactions
  WHERE driver_id = dd.driver_id
), 0)),
updated_at = NOW();
UPDATE settlements
SET 
  actual_payout = 0,
  debt_before = 0,
  debt_after = 0,
  debt_payment = 0
WHERE period_from >= '2026-04-06' 
  AND period_from <= '2026-04-13'
  AND actual_payout = -50
  AND COALESCE((amounts->>'uber_base')::numeric, 0) = 0
  AND COALESCE((amounts->>'total_cash')::numeric, 0) = 0
  AND COALESCE((amounts->>'bolt_payout_s')::numeric, 0) = 0
  AND COALESCE((amounts->>'freenow_base_s')::numeric, 0) = 0
  AND COALESCE((amounts->>'manual_week_adjustment')::numeric, 0) = 0;

DELETE FROM driver_debt_transactions
WHERE period_from >= '2026-04-06'
  AND period_from <= '2026-04-13'
  AND ABS(amount) = 50
  AND (description ILIKE '%opłat%' OR description ILIKE '%service%' OR description ILIKE '%abonament%');
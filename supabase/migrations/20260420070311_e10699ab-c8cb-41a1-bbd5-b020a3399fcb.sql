WITH bad_week_14 AS (
  SELECT s.id, s.driver_id
  FROM public.settlements s
  CROSS JOIN LATERAL (SELECT COALESCE(s.amounts, '{}'::jsonb) AS a) amounts
  WHERE s.period_from = DATE '2026-03-30'
    AND s.period_to = DATE '2026-04-05'
    AND COALESCE((amounts.a->>'uber_base')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'uber_cash_f')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'uber_net')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'uber_payout_d')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_projected_d')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_payout_s')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_cash')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_net')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'freenow_base_s')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'freenow_cash_f')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'freenow_net')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'fuel')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'fuel_vat_refund')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'manual_week_adjustment')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'manual_service_fee')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'manual_rental_fee')::numeric, 0) = 0
    AND COALESCE(s.rental_fee, 0) = 0
    AND COALESCE(s.actual_payout, 0) = -50
    AND COALESCE(s.debt_before, 0) = 0
    AND COALESCE(s.debt_after, 0) = 50
),
bad_week_15 AS (
  SELECT s.id, s.driver_id
  FROM public.settlements s
  JOIN bad_week_14 b14 ON b14.driver_id = s.driver_id
  CROSS JOIN LATERAL (SELECT COALESCE(s.amounts, '{}'::jsonb) AS a) amounts
  WHERE s.period_from = DATE '2026-04-06'
    AND s.period_to = DATE '2026-04-12'
    AND COALESCE((amounts.a->>'uber_base')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'uber_cash_f')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'uber_net')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'uber_payout_d')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_projected_d')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_payout_s')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_cash')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'bolt_net')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'freenow_base_s')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'freenow_cash_f')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'freenow_net')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'fuel')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'fuel_vat_refund')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'manual_week_adjustment')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'manual_service_fee')::numeric, 0) = 0
    AND COALESCE((amounts.a->>'manual_rental_fee')::numeric, 0) = 0
    AND COALESCE(s.rental_fee, 0) = 0
    AND COALESCE(s.actual_payout, 0) = -50
    AND COALESCE(s.debt_before, 0) = 50
    AND COALESCE(s.debt_after, 0) = 50
),
all_bad AS (
  SELECT id, driver_id FROM bad_week_14
  UNION
  SELECT id, driver_id FROM bad_week_15
),
delete_tx AS (
  DELETE FROM public.driver_debt_transactions t
  USING all_bad b
  WHERE t.settlement_id = b.id
    AND t.type IN ('debt_increase', 'debt_payment')
    AND t.debt_category = 'settlement'
  RETURNING t.driver_id
),
reset_settlements AS (
  UPDATE public.settlements s
  SET debt_before = 0,
      debt_payment = 0,
      debt_after = 0,
      actual_payout = 0,
      updated_at = now()
  FROM all_bad b
  WHERE s.id = b.id
  RETURNING s.driver_id
),
recalc_driver_debts AS (
  UPDATE public.driver_debts dd
  SET current_balance = GREATEST(COALESCE(src.balance, 0), 0),
      updated_at = now()
  FROM (
    SELECT d.id AS driver_id,
           COALESCE(SUM(CASE WHEN t.type IN ('debt_increase', 'manual_add') THEN ABS(COALESCE(t.amount,0)) ELSE -ABS(COALESCE(t.amount,0)) END), 0) AS balance
    FROM public.drivers d
    LEFT JOIN public.driver_debt_transactions t ON t.driver_id = d.id
    WHERE d.id IN (SELECT DISTINCT driver_id FROM all_bad)
    GROUP BY d.id
  ) src
  WHERE dd.driver_id = src.driver_id
  RETURNING dd.driver_id
)
SELECT 1;
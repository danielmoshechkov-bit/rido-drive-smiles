-- Zero out phantom debts for drivers with no earnings on fleet b780dbf2
-- 1. Update driver_debts.current_balance to 0
UPDATE driver_debts SET current_balance = 0, updated_at = now()
WHERE driver_id IN (
  SELECT d.id FROM drivers d
  JOIN driver_debts dd ON dd.driver_id = d.id
  WHERE dd.current_balance > 0
  AND d.fleet_id = 'b780dbf2-586b-4034-9176-be5431604f3e'
  AND (SELECT count(*) FROM settlements s WHERE s.driver_id = d.id AND s.net_amount > 0) = 0
);

-- 2. Zero out debt_before/debt_after in settlements for these drivers
UPDATE settlements SET debt_before = 0, debt_after = 0, debt_payment = 0
WHERE driver_id IN (
  SELECT d.id FROM drivers d
  WHERE d.fleet_id = 'b780dbf2-586b-4034-9176-be5431604f3e'
  AND (SELECT count(*) FROM settlements s WHERE s.driver_id = d.id AND s.net_amount > 0) = 0
)
AND (debt_before > 0 OR debt_after > 0);

-- 3. Delete phantom debt transactions for these drivers
DELETE FROM driver_debt_transactions
WHERE driver_id IN (
  SELECT d.id FROM drivers d
  WHERE d.fleet_id = 'b780dbf2-586b-4034-9176-be5431604f3e'
  AND (SELECT count(*) FROM settlements s WHERE s.driver_id = d.id AND s.net_amount > 0) = 0
)
AND type IN ('debt_increase', 'debt_payment');
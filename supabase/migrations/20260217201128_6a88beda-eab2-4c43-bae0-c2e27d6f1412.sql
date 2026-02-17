
-- 1. Delete Piotr Królak data from ai_user_credits (blocking FK)
DELETE FROM ai_user_credits WHERE user_id = '53506b2e-3406-44fc-81d0-16a38c17f3c9';

-- 2. Clean up duplicated debt transactions: keep only the FIRST entry per (driver_id, period_from, period_to, type, settlement_id)
DELETE FROM driver_debt_transactions 
WHERE id NOT IN (
  SELECT DISTINCT ON (driver_id, period_from, period_to, type, COALESCE(settlement_id, id)) id
  FROM driver_debt_transactions
  ORDER BY driver_id, period_from, period_to, type, COALESCE(settlement_id, id), created_at ASC
);

-- 3. Recalculate all driver_debts from scratch based on cleaned transactions
UPDATE driver_debts SET current_balance = 0, updated_at = now();

UPDATE driver_debts dd
SET current_balance = COALESCE(sub.total, 0),
    updated_at = now()
FROM (
  SELECT driver_id, SUM(
    CASE 
      WHEN type = 'debt_increase' OR type = 'manual_add' THEN ABS(amount)
      WHEN type = 'debt_payment' OR type = 'manual_payment' THEN -ABS(amount)
      ELSE amount
    END
  ) as total
  FROM driver_debt_transactions
  GROUP BY driver_id
) sub
WHERE dd.driver_id = sub.driver_id;

UPDATE driver_debts SET current_balance = 0 WHERE current_balance < 0;

-- 4. Insert document request for iwa4155@wp.pl (Beata Smosarska, driver_id: 29ea99fc)
INSERT INTO driver_document_requests (driver_id, fleet_id, template_code, template_name, status)
VALUES ('29ea99fc-bc45-422c-b293-5cea1739def0', 'b780dbf2-586b-4034-9176-be5431604f3e', 'rental_agreement', 'Umowa Najmu Pojazdu', 'pending')
ON CONFLICT DO NOTHING;


-- Clean up bogus Kacper Piluś (fleet owner) settlement data
-- 1. Delete the debt transaction
DELETE FROM driver_debt_transactions 
WHERE driver_id = '5f63b508-15e5-42f5-9792-5a9e05940f32'
  AND settlement_id = 'f977e027-ec47-452b-b91d-81e5e82d075a';

-- 2. Delete the debt record
DELETE FROM driver_debts 
WHERE driver_id = '5f63b508-15e5-42f5-9792-5a9e05940f32';

-- 3. Delete the bogus settlement
DELETE FROM settlements 
WHERE id = 'f977e027-ec47-452b-b91d-81e5e82d075a'
  AND driver_id = '5f63b508-15e5-42f5-9792-5a9e05940f32';

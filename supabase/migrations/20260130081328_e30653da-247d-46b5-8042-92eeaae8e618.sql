-- Usuń błędną transakcję długu
DELETE FROM driver_debt_transactions 
WHERE driver_id = '918a6ef9-ac30-442c-9b97-789f5d0f6541' 
AND period_from = '2026-01-19';

-- Usuń błędne rozliczenie
DELETE FROM settlements 
WHERE id = '373e9bfb-af52-46ae-bdda-6dbef2e5413d';

-- Wyzeruj dług kierowcy
UPDATE driver_debts 
SET current_balance = 0, updated_at = now() 
WHERE driver_id = '918a6ef9-ac30-442c-9b97-789f5d0f6541';

-- Clean up fleet owner Kacper Piluś debt (he's a fleet owner, not a driver)
DELETE FROM driver_debt_transactions WHERE driver_id = '5f63b508-15e5-42f5-9792-5a9e05940f32';
DELETE FROM driver_debts WHERE driver_id = '5f63b508-15e5-42f5-9792-5a9e05940f32';

-- Clean up duplicate Kacper Piluś record (b409fbba) - ghost driver with no user linked
DELETE FROM driver_debt_transactions WHERE driver_id = 'b409fbba-1ac6-4174-8f1e-4361349118cf';
DELETE FROM driver_debts WHERE driver_id = 'b409fbba-1ac6-4174-8f1e-4361349118cf';

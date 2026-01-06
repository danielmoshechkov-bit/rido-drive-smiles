-- Fix scooter icon from Zap to Bike
UPDATE marketplace_item_types 
SET icon = 'Bike' 
WHERE slug = 'skutery';

-- Update transaction types sort order
UPDATE marketplace_transaction_types SET sort_order = 1 WHERE slug = 'sprzedaz';
UPDATE marketplace_transaction_types SET sort_order = 2 WHERE slug = 'wynajem';
UPDATE marketplace_transaction_types SET sort_order = 3 WHERE slug = 'rent-to-own';
UPDATE marketplace_transaction_types SET sort_order = 4 WHERE slug = 'cesja-leasingu';
UPDATE marketplace_transaction_types SET sort_order = 5 WHERE slug = 'zamiana';
UPDATE marketplace_transaction_types SET sort_order = 6 WHERE slug = 'po-flocie';
UPDATE marketplace_transaction_types SET sort_order = 7 WHERE slug = 'pakiety-flotowe';
UPDATE marketplace_transaction_types SET sort_order = 8 WHERE slug = 'inwestycyjne';
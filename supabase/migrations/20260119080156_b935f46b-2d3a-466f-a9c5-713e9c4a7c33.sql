-- Dezaktywować kategorię "Inwestycyjne" domyślnie
UPDATE marketplace_transaction_types 
SET is_active = false 
WHERE slug = 'inwestycyjne';

-- Dodać nowe pola do vehicle_listings dla nowych typów transakcji
ALTER TABLE vehicle_listings 
ADD COLUMN IF NOT EXISTS short_term_rental_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS long_term_rental_data JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fleet_package_data JSONB DEFAULT NULL;
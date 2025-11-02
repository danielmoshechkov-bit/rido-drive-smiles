-- Dodaj kolumnę fuel_card_pin do tabeli drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS fuel_card_pin TEXT;

COMMENT ON COLUMN drivers.fuel_card_pin IS 'PIN karty paliwowej kierowcy';
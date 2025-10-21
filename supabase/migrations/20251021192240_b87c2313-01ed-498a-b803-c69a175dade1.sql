-- Dodaj kolumnę fuel_card_number do tabeli drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS fuel_card_number TEXT;

COMMENT ON COLUMN drivers.fuel_card_number IS 'Numer karty paliwowej kierowcy (kolumna F z CSV)';
-- Dodaj kolumnę fuel_type do vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type text;
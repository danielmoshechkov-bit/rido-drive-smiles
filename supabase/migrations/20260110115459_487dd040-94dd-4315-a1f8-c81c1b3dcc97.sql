-- Add payment method settings columns to fleets table
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_enabled boolean DEFAULT false;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_pickup_day text;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_pickup_location text;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_pickup_address text;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS b2b_enabled boolean DEFAULT false;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS transfer_enabled boolean DEFAULT true;
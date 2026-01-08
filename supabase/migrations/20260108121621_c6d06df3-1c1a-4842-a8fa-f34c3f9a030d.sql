-- Add VAT rate and base fee columns to fleets table
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 8;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS base_fee numeric DEFAULT 0;
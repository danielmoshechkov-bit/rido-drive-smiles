-- Add new columns for fleet payment settings
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_address_postal_code TEXT;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_address_street TEXT;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS cash_address_number TEXT;
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS b2b_invoice_frequency TEXT DEFAULT 'monthly';
-- Dodanie brakujących kolumn do vehicle_rentals
ALTER TABLE vehicle_rentals 
ADD COLUMN IF NOT EXISTS is_indefinite BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS rental_type TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS weekly_rental_fee NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS contract_number TEXT,
ADD COLUMN IF NOT EXISTS portal_access_token TEXT,
ADD COLUMN IF NOT EXISTS driver_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS fleet_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS driver_signature_url TEXT,
ADD COLUMN IF NOT EXISTS fleet_signature_url TEXT,
ADD COLUMN IF NOT EXISTS protocol_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

-- Uczynienie listing_id opcjonalnym
ALTER TABLE vehicle_rentals ALTER COLUMN listing_id DROP NOT NULL;

-- Zmiana weekly_price na opcjonalne
ALTER TABLE vehicle_rentals ALTER COLUMN weekly_price DROP NOT NULL;
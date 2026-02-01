-- Add missing statuses to vehicle_rentals constraint
ALTER TABLE vehicle_rentals DROP CONSTRAINT IF EXISTS vehicle_rentals_status_check;

ALTER TABLE vehicle_rentals ADD CONSTRAINT vehicle_rentals_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text, 
  'accepted'::text, 
  'active'::text, 
  'completed'::text, 
  'cancelled'::text, 
  'rejected'::text,
  'draft'::text,
  'pending_signature'::text,
  'signed'::text,
  'finalized'::text,
  'sent_to_client'::text,
  'client_signed'::text,
  'fleet_signed'::text
]));

-- Create fleet_signatures table if not exists
CREATE TABLE IF NOT EXISTS fleet_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE UNIQUE,
  signature_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  auto_sign_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fleet_signatures_fleet_id ON fleet_signatures(fleet_id);

-- Enable RLS on fleet_signatures
ALTER TABLE fleet_signatures ENABLE ROW LEVEL SECURITY;

-- Allow fleet users to manage their own signatures
CREATE POLICY "Fleet users can view own signatures" ON fleet_signatures
FOR SELECT USING (
  fleet_id IN (SELECT fleet_id FROM user_roles WHERE user_id = auth.uid())
);

CREATE POLICY "Fleet users can insert own signatures" ON fleet_signatures
FOR INSERT WITH CHECK (
  fleet_id IN (SELECT fleet_id FROM user_roles WHERE user_id = auth.uid())
);

CREATE POLICY "Fleet users can update own signatures" ON fleet_signatures
FOR UPDATE USING (
  fleet_id IN (SELECT fleet_id FROM user_roles WHERE user_id = auth.uid())
);

CREATE POLICY "Fleet users can delete own signatures" ON fleet_signatures
FOR DELETE USING (
  fleet_id IN (SELECT fleet_id FROM user_roles WHERE user_id = auth.uid())
);
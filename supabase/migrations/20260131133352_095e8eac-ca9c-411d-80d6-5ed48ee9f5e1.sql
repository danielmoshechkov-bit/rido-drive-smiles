-- Add source column to differentiate marketplace reservations from fleet contracts
ALTER TABLE public.vehicle_rentals 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'fleet' CHECK (source IN ('marketplace', 'fleet'));

-- Add SMS invitation support
ALTER TABLE public.vehicle_rentals
ADD COLUMN IF NOT EXISTS invitation_phone TEXT,
ADD COLUMN IF NOT EXISTS invitation_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_method TEXT DEFAULT 'email' CHECK (invitation_method IN ('email', 'sms', 'both'));

-- Add legal logging for signatures
ALTER TABLE public.vehicle_rentals
ADD COLUMN IF NOT EXISTS driver_signature_ip TEXT,
ADD COLUMN IF NOT EXISTS driver_signature_user_agent TEXT,
ADD COLUMN IF NOT EXISTS fleet_signature_ip TEXT,
ADD COLUMN IF NOT EXISTS fleet_signature_user_agent TEXT,
ADD COLUMN IF NOT EXISTS contract_locked_at TIMESTAMPTZ;

-- Create signature audit log table for legal purposes
CREATE TABLE IF NOT EXISTS public.contract_signature_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES public.vehicle_rentals(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('email_sent', 'sms_sent', 'contract_viewed', 'checkboxes_accepted', 'signature_drawn', 'signature_submitted', 'fleet_signed', 'contract_locked')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('driver', 'fleet', 'system')),
  actor_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_contract_signature_logs_rental_id ON public.contract_signature_logs(rental_id);

-- Add RLS policies
ALTER TABLE public.contract_signature_logs ENABLE ROW LEVEL SECURITY;

-- Fleet managers can view logs for their rentals
CREATE POLICY "Fleet managers can view their rental logs"
ON public.contract_signature_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM vehicle_rentals vr
    JOIN fleets f ON f.id = vr.fleet_id
    JOIN user_roles ur ON ur.fleet_id = f.id
    WHERE vr.id = contract_signature_logs.rental_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('fleet_settlement', 'fleet_rental')
  )
);

-- System can insert logs
CREATE POLICY "Authenticated users can insert logs"
ON public.contract_signature_logs FOR INSERT
WITH CHECK (true);

-- Add driver consent for reviews (visible to fleet only)
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS consent_fleet_reviews BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_fleet_reviews_date TIMESTAMPTZ;

-- Ensure rental_reviews has visibility column for fleet-only reviews
ALTER TABLE public.rental_reviews
ADD COLUMN IF NOT EXISTS is_fleet_only BOOLEAN DEFAULT false;

-- Comment for clarity
COMMENT ON COLUMN public.vehicle_rentals.source IS 'marketplace = reservation from vehicle listing, fleet = contract created by fleet manager';
COMMENT ON COLUMN public.contract_signature_logs.action_type IS 'Audit log of all actions in the contract signing process for legal purposes';
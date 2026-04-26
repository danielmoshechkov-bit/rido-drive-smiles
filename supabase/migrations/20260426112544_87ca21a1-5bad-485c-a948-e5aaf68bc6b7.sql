-- Add cancellation and reschedule fields to workshop_client_bookings
ALTER TABLE public.workshop_client_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS proposed_date DATE,
  ADD COLUMN IF NOT EXISTS proposed_time TIME WITHOUT TIME ZONE;

-- Public read by token (for confirmation page) — already may exist; ensure RLS policy is permissive for token-based reads
DROP POLICY IF EXISTS "Public can view booking by token" ON public.workshop_client_bookings;
CREATE POLICY "Public can view booking by token"
ON public.workshop_client_bookings
FOR SELECT
USING (confirmation_token IS NOT NULL);

-- Public update by token (confirm / cancel / propose reschedule)
DROP POLICY IF EXISTS "Public can update booking by token" ON public.workshop_client_bookings;
CREATE POLICY "Public can update booking by token"
ON public.workshop_client_bookings
FOR UPDATE
USING (confirmation_token IS NOT NULL);
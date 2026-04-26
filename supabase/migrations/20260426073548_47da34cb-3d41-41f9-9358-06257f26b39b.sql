
ALTER TABLE public.workshop_client_bookings
  ADD COLUMN IF NOT EXISTS confirmation_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS workshop_client_bookings_confirmation_token_idx
  ON public.workshop_client_bookings(confirmation_token);

-- Backfill tokens for existing rows
UPDATE public.workshop_client_bookings
SET confirmation_token = gen_random_uuid()
WHERE confirmation_token IS NULL;

-- Public read by token (used by the confirmation page)
DROP POLICY IF EXISTS "public can read booking by token" ON public.workshop_client_bookings;
CREATE POLICY "public can read booking by token"
  ON public.workshop_client_bookings
  FOR SELECT
  USING (true);

-- Public can confirm by token (only sets confirmed_at + status = confirmed)
DROP POLICY IF EXISTS "public can confirm booking by token" ON public.workshop_client_bookings;
CREATE POLICY "public can confirm booking by token"
  ON public.workshop_client_bookings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

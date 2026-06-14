-- =====================================================================
-- Phone-number leak hardening
-- ---------------------------------------------------------------------
-- Closes two RLS holes where personal data (phone numbers) was readable
-- by users who shouldn't see it:
--
--   1) vehicle_owners — migration 20260507 added a proper role-scoped
--      policy and tried to drop the permissive ones, but its DROPs named
--      "Anyone…/Public…" while the live policies are "Fleet members…
--      USING (true)", so the open SELECT survived. Drop them for real;
--      the role-scoped "Admins fleet manage vehicle owners" policy stays.
--
--   2) workshop_client_bookings — the public confirmation page used
--      policies USING (confirmation_token IS NOT NULL), which let ANY
--      anonymous caller read/update EVERY booking that has a token (the
--      token VALUE was never checked at the row level). Replace the
--      direct table access with token-scoped SECURITY DEFINER RPCs so a
--      caller can only touch the single booking whose secret token they
--      hold, and drop the open policies.
-- =====================================================================

-- ---- 1) vehicle_owners: remove the leftover open policies -------------
DROP POLICY IF EXISTS "Fleet members can view vehicle owners"   ON public.vehicle_owners;
DROP POLICY IF EXISTS "Fleet members can insert vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Fleet members can update vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Fleet members can delete vehicle owners" ON public.vehicle_owners;

-- ---- 2) workshop_client_bookings: token-scoped RPCs -------------------
-- Read the single booking (plus the public provider contact fields) that
-- matches the secret token.
CREATE OR REPLACE FUNCTION public.get_workshop_booking_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(b) || jsonb_build_object(
    'service_providers',
    (SELECT jsonb_build_object(
        'company_name',        sp.company_name,
        'short_name',          sp.short_name,
        'company_address',     sp.company_address,
        'company_city',        sp.company_city,
        'company_postal_code', sp.company_postal_code,
        'company_phone',       sp.company_phone
     ) FROM service_providers sp WHERE sp.id = b.provider_id)
  )
  FROM workshop_client_bookings b
  WHERE p_token IS NOT NULL
    AND length(p_token) >= 10
    AND b.confirmation_token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.confirm_workshop_booking_by_token(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE workshop_client_bookings
  SET status = 'confirmed', confirmed_at = now()
  WHERE p_token IS NOT NULL AND length(p_token) >= 10
    AND confirmation_token = p_token
    AND status NOT IN ('cancelled');
$$;

CREATE OR REPLACE FUNCTION public.cancel_workshop_booking_by_token(p_token text, p_reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE workshop_client_bookings
  SET status = 'cancelled', cancelled_at = now(),
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE p_token IS NOT NULL AND length(p_token) >= 10
    AND confirmation_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_workshop_booking_by_token(p_token text, p_date date, p_time text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE workshop_client_bookings
  SET status = 'reschedule_requested', reschedule_requested_at = now(),
      proposed_date = p_date, proposed_time = p_time::time
  WHERE p_token IS NOT NULL AND length(p_token) >= 10
    AND confirmation_token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.get_workshop_booking_by_token(text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_workshop_booking_by_token(text)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_workshop_booking_by_token(text, text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_workshop_booking_by_token(text, date, text) TO anon, authenticated;

-- Remove the open public table policies (RPCs above replace them).
DROP POLICY IF EXISTS "Public can view booking by token"   ON public.workshop_client_bookings;
DROP POLICY IF EXISTS "Public can update booking by token" ON public.workshop_client_bookings;

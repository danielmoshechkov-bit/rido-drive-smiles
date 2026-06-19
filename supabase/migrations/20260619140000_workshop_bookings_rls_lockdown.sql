-- =====================================================================
-- TURA PII / FIX 1 — workshop_client_bookings RLS lockdown
-- ---------------------------------------------------------------------
-- workshop_client_bookings holds clients' personal data (name, phone,
-- plate, fault description). The public confirmation page (/r/:token,
-- BookingConfirm.tsx) does NOT read the table directly — it goes
-- exclusively through 4 token-scoped SECURITY DEFINER RPCs created in
-- 20260613140000_phone_leak_hardening.sql:
--   get_/confirm_/cancel_/reschedule_workshop_booking_by_token
-- which check `confirmation_token = p_token` row-by-row and bypass RLS.
--
-- The phone-leak migration dropped the PascalCase public policies
-- ("Public can view/update booking by token"), but TWO lowercase
-- USING(true) policies from 20260426073548 survived and remain a live
-- leak — any anonymous caller can SELECT * and UPDATE every booking:
--   "public can read booking by token"     FOR SELECT USING (true)
--   "public can confirm booking by token"  FOR UPDATE USING (true) WITH CHECK (true)
--
-- This migration removes ALL public table policies and leaves exactly
-- one policy: provider-scoped FOR ALL (the workshop owner managing their
-- own bookings via WorkshopScheduler.tsx / WorkshopSmsCenter.tsx).
-- Anonymous clients keep working through the SECURITY DEFINER RPCs.
-- =====================================================================

ALTER TABLE public.workshop_client_bookings ENABLE ROW LEVEL SECURITY;

-- ---- Drop every historic public/open policy (idempotent, defensive) ---
-- The two live leaks:
DROP POLICY IF EXISTS "public can read booking by token"    ON public.workshop_client_bookings;
DROP POLICY IF EXISTS "public can confirm booking by token" ON public.workshop_client_bookings;
-- Already dropped by phone-leak hardening, re-asserted so this file is
-- authoritative regardless of the live DB's exact state:
DROP POLICY IF EXISTS "Public can view booking by token"    ON public.workshop_client_bookings;
DROP POLICY IF EXISTS "Public can update booking by token"  ON public.workshop_client_bookings;

-- ---- Re-assert the ONLY surviving policy: provider-scoped FOR ALL -----
-- (identical to 20260406002345; DROP+CREATE makes the final state
--  authoritative and idempotent.)
DROP POLICY IF EXISTS "Users manage own workshop bookings"  ON public.workshop_client_bookings;
CREATE POLICY "Users manage own workshop bookings"
  ON public.workshop_client_bookings
  FOR ALL
  TO authenticated
  USING      (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- =====================================================================
-- EXPECTED FINAL POLICY SET on public.workshop_client_bookings
-- (verify after apply — there must be NO USING(true) and NO public role):
--
--   policyname                          | cmd | roles         | qual / with_check
--   ------------------------------------+-----+---------------+---------------------------------------
--   Users manage own workshop bookings  | ALL | authenticated | provider_id IN (SELECT id FROM
--                                       |     |               |   service_providers WHERE
--                                       |     |               |   user_id = auth.uid())
--
-- Anonymous /r/:token access = the 4 SECURITY DEFINER RPCs only.
--
-- Verify query:
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname='public' AND tablename='workshop_client_bookings'
--   ORDER BY policyname;
-- =====================================================================

-- =====================================================================
-- ROLLBACK (restores the pre-fix open policies — RE-OPENS THE LEAK):
--
--   DROP POLICY IF EXISTS "public can read booking by token"    ON public.workshop_client_bookings;
--   CREATE POLICY "public can read booking by token"
--     ON public.workshop_client_bookings FOR SELECT USING (true);
--
--   DROP POLICY IF EXISTS "public can confirm booking by token" ON public.workshop_client_bookings;
--   CREATE POLICY "public can confirm booking by token"
--     ON public.workshop_client_bookings FOR UPDATE USING (true) WITH CHECK (true);
--
--   -- (the provider-scoped "Users manage own workshop bookings" policy is
--   --  unchanged in behaviour, so no rollback needed for it.)
-- =====================================================================

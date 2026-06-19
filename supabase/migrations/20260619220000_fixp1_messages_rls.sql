-- =====================================================================
-- TURA PII / FIX 3 — messages (czat kierowca ↔ administrator/flota)
-- ---------------------------------------------------------------------
-- messages holds chat content (PII). The only live policy was
-- "Admins can manage messages" — ALL, role PUBLIC, USING(true): any
-- anonymous caller could read and write EVERY driver's chat. Replace it
-- with a scoped policy.
--
-- Reader (read-only analysis, confirmed before writing):
--  * src/components/chat/ChatPanel.tsx is the ONLY code touching
--    public.messages — SELECT + INSERT (from_role='driver'), keyed by
--    driverData.driver_id. Rendered only in DriverDashboard, which
--    REQUIRES an authenticated Supabase session (redirects to /auth).
--  * The driver↔auth link is NOT drivers.user_id (that column does NOT
--    exist). It is driver_app_users: user_id -> driver_id (both uuid).
--    See DriverDashboard.tsx — .from('driver_app_users')
--    .select('driver_id').eq('user_id', session.user.id).
--  * No operator/admin UI currently reads messages, but fleet operators
--    (get_my_driver_ids) and admins are granted access for the reply path.
--  * messages.driver_id is uuid (= drivers.id = driver_app_users.driver_id)
--    → no text/uuid cast needed.
--
-- Scope (USING = WITH CHECK, so WRITE is closed by the same predicate):
--   driver-self  : driver_id IN (driver_app_users WHERE user_id = auth.uid())
--   fleet operator: driver_id IN (get_my_driver_ids())
--   admin        : has_role(admin)
-- A driver can therefore only read/insert messages for their OWN driver_id.
-- =====================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop the open public USING(true) leak.
DROP POLICY IF EXISTS "Admins can manage messages" ON public.messages;

CREATE POLICY "messages driver self or fleet or admin"
  ON public.messages
  FOR ALL
  TO authenticated
  USING (
        driver_id IN (SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid())
     OR driver_id IN (SELECT get_my_driver_ids())
     OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
        driver_id IN (SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid())
     OR driver_id IN (SELECT get_my_driver_ids())
     OR has_role(auth.uid(), 'admin'::app_role)
  );

-- =====================================================================
-- EXPECTED FINAL POLICY SET on public.messages
-- (verify after apply — NO USING(true), NO public/anon role):
--
--   policyname                              | cmd | roles         | qual / with_check
--   ----------------------------------------+-----+---------------+----------------------------------
--   messages driver self or fleet or admin  | ALL | authenticated | driver_id IN (driver_app_users
--                                           |     |               |   WHERE user_id = auth.uid())
--                                           |     |               | OR driver_id IN get_my_driver_ids()
--                                           |     |               | OR has_role(admin)
--
-- Verify:
--   SELECT policyname, cmd, roles::text, qual, with_check
--   FROM pg_policies WHERE schemaname='public' AND tablename='messages'
--   ORDER BY policyname;
-- =====================================================================

-- =====================================================================
-- ROLLBACK (re-opens the leak):
--   DROP POLICY IF EXISTS "messages driver self or fleet or admin" ON public.messages;
--   CREATE POLICY "Admins can manage messages" ON public.messages
--     FOR ALL TO public USING (true);
-- =====================================================================

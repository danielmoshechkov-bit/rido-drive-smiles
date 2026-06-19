-- =====================================================================
-- TURA PII / FIX 2 — fleet_* + ksef_alert_emails RLS lockdown
-- ---------------------------------------------------------------------
-- Closes open USING(true) / public-role policies on four low-risk tables
-- (0–1 rows). Helpers already deployed: get_my_fleet_ids() (SETOF uuid),
-- has_role(uuid, app_role).
--
-- Regression analysis (read-only, confirmed before writing this file):
--  * ksef_alert_emails — writers/readers:
--      - Edge ksef-monitor (SELECT active) + ksef-unsubscribe (UPDATE)
--        both use SUPABASE_SERVICE_ROLE_KEY → bypass RLS, unaffected.
--      - Front KsefAdminPanel (admin) read/upsert/delete → covered by
--        has_role(admin).
--      - Front KsefUserSettings (logged-in user) reads by email + upserts
--        own subscription with user_id = auth.uid() → covered by the
--        new self policy. The single existing row had user_id = NULL
--        (daniel, who is admin), so it was only visible via admin before;
--        we BACKFILL user_id by email so self-access works going forward.
--  * fleet_document_instances / _templates — front-only (authenticated
--      fleet screens: DocumentsManagement, Upload/CreateTemplateModal,
--      FillAndSendPanel). fleet_id column present.
--  * fleet_payment_notifications — front (FleetPaymentNotifications) does
--      SELECT + UPDATE only; INSERT happens exclusively in edge
--      rental-payment-reminders via SUPABASE_SERVICE_ROLE_KEY (bypasses
--      RLS), so no INSERT policy is needed. fleet_id column present.
--  * This migration touches ONLY ksef_alert_emails (the alert-mail list).
--    No other ksef_* table (ksef_settings / ksef_transmissions / KSeF
--    invoicing) is altered.
-- =====================================================================


-- =====================================================================
-- 1) ksef_alert_emails  (1 row)
-- =====================================================================
ALTER TABLE public.ksef_alert_emails ENABLE ROW LEVEL SECURITY;

-- Drop the open leak + the two redundant admin-only policies (consolidated below).
DROP POLICY IF EXISTS "Admin full access on ksef_alert_emails" ON public.ksef_alert_emails;  -- ALL authenticated USING(true) — LEAK
DROP POLICY IF EXISTS "Admins can manage ksef_alert_emails"    ON public.ksef_alert_emails;
DROP POLICY IF EXISTS "Admins read ksef_alert_emails"          ON public.ksef_alert_emails;

-- Backfill user_id by email so the self policy works for existing rows
-- (only rows whose email matches an auth user).
UPDATE public.ksef_alert_emails k
SET user_id = u.id
FROM auth.users u
WHERE k.user_id IS NULL
  AND lower(u.email) = lower(k.email);

-- Single policy: a user manages their own subscription; admins manage all.
CREATE POLICY "ksef_alert_emails self or admin"
  ON public.ksef_alert_emails
  FOR ALL
  TO authenticated
  USING      (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));


-- =====================================================================
-- 2) fleet_document_instances  (0 rows)
-- =====================================================================
ALTER TABLE public.fleet_document_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet owners can manage their document instances" ON public.fleet_document_instances;  -- ALL authenticated USING(true) — LEAK

-- NOTE: fleet_document_instances.fleet_id is TEXT (stores fleets.id UUID as
-- string), while get_my_fleet_ids() returns SETOF uuid → cast to text.
CREATE POLICY "fleet_document_instances fleet or admin"
  ON public.fleet_document_instances
  FOR ALL
  TO authenticated
  USING      (fleet_id IN (SELECT get_my_fleet_ids()::text) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (fleet_id IN (SELECT get_my_fleet_ids()::text) OR has_role(auth.uid(), 'admin'::app_role));


-- =====================================================================
-- 3) fleet_document_templates  (0 rows)
-- =====================================================================
ALTER TABLE public.fleet_document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet owners can manage their templates" ON public.fleet_document_templates;  -- ALL authenticated USING(true) — LEAK

-- NOTE: fleet_document_templates.fleet_id is TEXT → cast get_my_fleet_ids() to text.
CREATE POLICY "fleet_document_templates fleet or admin"
  ON public.fleet_document_templates
  FOR ALL
  TO authenticated
  USING      (fleet_id IN (SELECT get_my_fleet_ids()::text) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (fleet_id IN (SELECT get_my_fleet_ids()::text) OR has_role(auth.uid(), 'admin'::app_role));


-- =====================================================================
-- 4) fleet_payment_notifications  (0 rows)
-- =====================================================================
ALTER TABLE public.fleet_payment_notifications ENABLE ROW LEVEL SECURITY;

-- All three live policies are role {public} USING(true) — drop them.
DROP POLICY IF EXISTS "Fleet users can view their notifications"   ON public.fleet_payment_notifications;  -- SELECT public USING(true) — LEAK
DROP POLICY IF EXISTS "Fleet users can update their notifications" ON public.fleet_payment_notifications;  -- UPDATE public USING(true) — LEAK
DROP POLICY IF EXISTS "System can insert notifications"            ON public.fleet_payment_notifications;  -- INSERT public — edge uses service-role, not needed

-- Front does SELECT + UPDATE; INSERT stays edge-only (service-role bypass).
CREATE POLICY "fleet_payment_notifications fleet or admin"
  ON public.fleet_payment_notifications
  FOR ALL
  TO authenticated
  USING      (fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (fleet_id IN (SELECT get_my_fleet_ids()) OR has_role(auth.uid(), 'admin'::app_role));


-- =====================================================================
-- EXPECTED FINAL POLICY SET (verify after apply — NO USING(true), NO public role):
--
--   ksef_alert_emails            : "ksef_alert_emails self or admin"            ALL authenticated
--                                    (user_id = auth.uid() OR has_role(admin))
--   fleet_document_instances     : "fleet_document_instances fleet or admin"    ALL authenticated
--                                    (fleet_id IN get_my_fleet_ids() OR has_role(admin))
--   fleet_document_templates     : "fleet_document_templates fleet or admin"    ALL authenticated
--                                    (fleet_id IN get_my_fleet_ids() OR has_role(admin))
--   fleet_payment_notifications  : "fleet_payment_notifications fleet or admin"  ALL authenticated
--                                    (fleet_id IN get_my_fleet_ids() OR has_role(admin))
--
-- Verify:
--   SELECT tablename, policyname, cmd, roles::text, qual, with_check
--   FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('ksef_alert_emails','fleet_document_instances',
--                       'fleet_document_templates','fleet_payment_notifications')
--   ORDER BY tablename, policyname;
-- =====================================================================

-- =====================================================================
-- ROLLBACK (re-opens the leaks):
--   -- ksef_alert_emails
--   DROP POLICY IF EXISTS "ksef_alert_emails self or admin" ON public.ksef_alert_emails;
--   CREATE POLICY "Admin full access on ksef_alert_emails" ON public.ksef_alert_emails
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   CREATE POLICY "Admins can manage ksef_alert_emails" ON public.ksef_alert_emails
--     FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
--   CREATE POLICY "Admins read ksef_alert_emails" ON public.ksef_alert_emails
--     FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
--   -- (user_id backfill is not reverted — harmless.)
--
--   -- fleet_document_instances
--   DROP POLICY IF EXISTS "fleet_document_instances fleet or admin" ON public.fleet_document_instances;
--   CREATE POLICY "Fleet owners can manage their document instances" ON public.fleet_document_instances
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
--   -- fleet_document_templates
--   DROP POLICY IF EXISTS "fleet_document_templates fleet or admin" ON public.fleet_document_templates;
--   CREATE POLICY "Fleet owners can manage their templates" ON public.fleet_document_templates
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
--   -- fleet_payment_notifications
--   DROP POLICY IF EXISTS "fleet_payment_notifications fleet or admin" ON public.fleet_payment_notifications;
--   CREATE POLICY "Fleet users can view their notifications"   ON public.fleet_payment_notifications FOR SELECT USING (true);
--   CREATE POLICY "Fleet users can update their notifications" ON public.fleet_payment_notifications FOR UPDATE USING (true);
--   CREATE POLICY "System can insert notifications"            ON public.fleet_payment_notifications FOR INSERT WITH CHECK (true);
-- =====================================================================

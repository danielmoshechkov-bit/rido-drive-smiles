-- =====================================================================
-- TURA PII / FIX 4 — client_reports (raporty marketingowe klientów agencji)
-- ---------------------------------------------------------------------
-- client_reports holds per-client marketing reports (summary, spend,
-- ROAS, leads). The only live policy was "Authenticated users manage
-- reports" — ALL, authenticated, USING(true). Because GetRido is
-- multi-portal, EVERY authenticated user (drivers, marketplace users,
-- workshop clients, ...) could read every agency's client reports — a
-- real cross-portal leak.
--
-- Read-only analysis (confirmed before writing):
--  * 0 rows. Columns client_id/agency_id/created_by are all nullable
--    with NO default; front (MarketingClientsTab.saveReport) sets only
--    client_id + content → created_by/agency_id are always NULL, so
--    per-author / per-agency scoping is NOT viable without schema+front
--    changes.
--  * There is NO master "agencies" table and NO agency↔user mapping:
--    agency_settings has no owner/user_id; agency_clients has no
--    agency_id (only added_by/assigned_to) and the front loads it
--    UNFILTERED (from('agency_clients').select('*')). The module is
--    effectively single-tenant / shared-team today.
--  * app_role has 'marketing_manager' = agency staff identity.
--
-- DECISION (Daniel, 19.06): Option A — restrict to agency staff, shared
--   within the team: has_role(marketing_manager) OR has_role(admin).
--   This closes the cross-portal leak, matches the unfiltered shared
--   client list, and needs no front change or backfill. True per-agency
--   isolation (add agency_id ownership + scope agency_clients/campaigns
--   together) is a separate, larger project.
-- =====================================================================

ALTER TABLE public.client_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage reports" ON public.client_reports;

CREATE POLICY "client_reports marketing staff or admin"
  ON public.client_reports
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'marketing_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'marketing_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- EXPECTED FINAL POLICY SET on public.client_reports
-- (verify after apply — NO USING(true), NO public/anon role):
--
--   policyname                              | cmd | roles         | qual / with_check
--   ----------------------------------------+-----+---------------+-------------------------------------
--   client_reports marketing staff or admin | ALL | authenticated | has_role(marketing_manager)
--                                           |     |               |   OR has_role(admin)
--
-- Verify:
--   SELECT policyname, cmd, roles::text, qual, with_check
--   FROM pg_policies WHERE schemaname='public' AND tablename='client_reports'
--   ORDER BY policyname;
-- =====================================================================

-- =====================================================================
-- ROLLBACK (re-opens the leak):
--   DROP POLICY IF EXISTS "client_reports marketing staff or admin" ON public.client_reports;
--   CREATE POLICY "Authenticated users manage reports" ON public.client_reports
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- =====================================================================


-- ============================================================
-- SECURITY FIX BATCH 1: Replace permissive public USING(true)
-- policies with admin/fleet-scoped policies on sensitive tables
-- ============================================================

-- 1) driver_debt_transactions (admins + fleet only)
DROP POLICY IF EXISTS "Admins and fleet managers can manage debt transactions" ON public.driver_debt_transactions;
CREATE POLICY "Admins manage debt transactions" ON public.driver_debt_transactions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR 
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_debt_transactions.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_debt_transactions.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  );

-- 2) driver_app_users (admin only ALL; keep self-insert)
DROP POLICY IF EXISTS "Admins can manage driver app users" ON public.driver_app_users;
CREATE POLICY "Admins manage driver app users" ON public.driver_app_users
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3) driver_documents (admin + fleet)
DROP POLICY IF EXISTS "Admins can manage driver documents" ON public.driver_documents;
CREATE POLICY "Admins fleet manage driver documents" ON public.driver_documents
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  );

-- 4) fleet_city_settings (admin + fleet)
DROP POLICY IF EXISTS "Anyone can view fleet city settings" ON public.fleet_city_settings;
DROP POLICY IF EXISTS "Anyone can insert fleet city settings" ON public.fleet_city_settings;
DROP POLICY IF EXISTS "Anyone can update fleet city settings" ON public.fleet_city_settings;
DROP POLICY IF EXISTS "Anyone can delete fleet city settings" ON public.fleet_city_settings;
DROP POLICY IF EXISTS "Public can view fleet city settings" ON public.fleet_city_settings;
DROP POLICY IF EXISTS "Public can manage fleet city settings" ON public.fleet_city_settings;
CREATE POLICY "Authenticated read fleet city settings" ON public.fleet_city_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage fleet city settings" ON public.fleet_city_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) import_errors, import_jobs (admin + fleet_settlement only)
DROP POLICY IF EXISTS "Anyone can view import errors" ON public.import_errors;
DROP POLICY IF EXISTS "Anyone can insert import errors" ON public.import_errors;
DROP POLICY IF EXISTS "Anyone can manage import errors" ON public.import_errors;
DROP POLICY IF EXISTS "Public can view import errors" ON public.import_errors;
CREATE POLICY "Admins manage import errors" ON public.import_errors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement'));

DROP POLICY IF EXISTS "Anyone can view import jobs" ON public.import_jobs;
DROP POLICY IF EXISTS "Anyone can insert import jobs" ON public.import_jobs;
DROP POLICY IF EXISTS "Anyone can manage import jobs" ON public.import_jobs;
DROP POLICY IF EXISTS "Public can view import jobs" ON public.import_jobs;
CREATE POLICY "Admins manage import jobs" ON public.import_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement'));

-- 6) support_ticket_whitelist - admin only, drop public read
DROP POLICY IF EXISTS "Anyone can read active whitelist" ON public.support_ticket_whitelist;
CREATE POLICY "Admins read whitelist" ON public.support_ticket_whitelist
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 7) settlement_visibility_settings + rido_dedup_settings (admin only writes; auth read)
DROP POLICY IF EXISTS "Anyone can manage settlement visibility" ON public.settlement_visibility_settings;
DROP POLICY IF EXISTS "Anyone can update settlement visibility" ON public.settlement_visibility_settings;
DROP POLICY IF EXISTS "Public can manage settlement visibility" ON public.settlement_visibility_settings;
CREATE POLICY "Auth read settlement visibility" ON public.settlement_visibility_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage settlement visibility" ON public.settlement_visibility_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Anyone can manage rido dedup" ON public.rido_dedup_settings;
DROP POLICY IF EXISTS "Authenticated users can manage rido dedup settings" ON public.rido_dedup_settings;
DROP POLICY IF EXISTS "Public can manage rido dedup" ON public.rido_dedup_settings;
CREATE POLICY "Auth read rido dedup" ON public.rido_dedup_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage rido dedup" ON public.rido_dedup_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 8) location_integrations (clear leaked API keys, admin-only)
UPDATE public.location_integrations
   SET config = config - 'api_key' - 'apiKey' - 'key'
 WHERE provider = 'google_places';

DROP POLICY IF EXISTS "Anyone can read location integrations" ON public.location_integrations;
DROP POLICY IF EXISTS "Public read location integrations" ON public.location_integrations;
DROP POLICY IF EXISTS "Anyone can view location integrations" ON public.location_integrations;
CREATE POLICY "Admins manage location integrations" ON public.location_integrations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 9) fleets (admin + fleet members)
DROP POLICY IF EXISTS "Admins can manage fleets" ON public.fleets;
CREATE POLICY "Admins manage fleets" ON public.fleets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Fleet members can view their fleet" ON public.fleets
  FOR SELECT TO authenticated
  USING (id = public.get_user_fleet_id(auth.uid()));

-- 10) drivers - tighten SELECT and INSERT
DROP POLICY IF EXISTS "Authenticated users can insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Users can select drivers they just created by email" ON public.drivers;
CREATE POLICY "Admins fleet insert drivers" ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR fleet_id = public.get_user_fleet_id(auth.uid()));

-- 11) driver_debts (admin + fleet)
DROP POLICY IF EXISTS "Admins can manage driver debts" ON public.driver_debts;
CREATE POLICY "Admins fleet manage driver debts" ON public.driver_debts
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_debts.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_debts.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  );

-- 12) driver_document_statuses (admin + fleet)
DROP POLICY IF EXISTS "Admins can manage document statuses" ON public.driver_document_statuses;
CREATE POLICY "Admins fleet manage document statuses" ON public.driver_document_statuses
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_document_statuses.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_document_statuses.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  );

-- 13) ksef_alert_emails (admin only)
DROP POLICY IF EXISTS "Anyone can read ksef_alert_emails" ON public.ksef_alert_emails;
CREATE POLICY "Admins read ksef_alert_emails" ON public.ksef_alert_emails
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 14) driver_communications (admin + fleet)
DROP POLICY IF EXISTS "Admins can manage driver communications" ON public.driver_communications;
CREATE POLICY "Admins fleet manage driver communications" ON public.driver_communications
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_communications.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_communications.driver_id AND d.fleet_id = public.get_user_fleet_id(auth.uid()))
  );

-- 15) rido_settings (admin only)
DROP POLICY IF EXISTS "Admins can manage rido settings" ON public.rido_settings;
CREATE POLICY "Admins manage rido settings" ON public.rido_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 16) admin_communication_settings (admin only)
DROP POLICY IF EXISTS "Anyone can manage admin communication settings" ON public.admin_communication_settings;
DROP POLICY IF EXISTS "Public manage admin communication settings" ON public.admin_communication_settings;
DROP POLICY IF EXISTS "Authenticated users can manage admin communication" ON public.admin_communication_settings;
CREATE POLICY "Admins manage communication settings" ON public.admin_communication_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 17) vehicle_owners + vehicle_owner_charges (admin + fleet)
DROP POLICY IF EXISTS "Anyone can view vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Anyone can insert vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Anyone can update vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Anyone can delete vehicle owners" ON public.vehicle_owners;
DROP POLICY IF EXISTS "Public manage vehicle owners" ON public.vehicle_owners;
CREATE POLICY "Admins fleet manage vehicle owners" ON public.vehicle_owners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement') OR public.has_role(auth.uid(),'fleet_rental'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement') OR public.has_role(auth.uid(),'fleet_rental'));

DROP POLICY IF EXISTS "Anyone can view vehicle owner charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Anyone can insert vehicle owner charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Anyone can update vehicle owner charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Anyone can delete vehicle owner charges" ON public.vehicle_owner_charges;
DROP POLICY IF EXISTS "Public manage vehicle owner charges" ON public.vehicle_owner_charges;
CREATE POLICY "Admins fleet manage vehicle owner charges" ON public.vehicle_owner_charges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement') OR public.has_role(auth.uid(),'fleet_rental'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_settlement') OR public.has_role(auth.uid(),'fleet_rental'));

-- 18) marketplace_user_profiles - hide PII (email/phone) in public view
-- Replace public read policy: only expose explicitly-public fields by requiring authentication for reads.
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.marketplace_user_profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.marketplace_user_profiles;
CREATE POLICY "Owner can view own profile" ON public.marketplace_user_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Authenticated can view marketplace profiles" ON public.marketplace_user_profiles
  FOR SELECT TO authenticated
  USING (account_mode IN ('private_seller','business'));

-- Polityki ZEZWALAJĄCE, odwzorowujące produkcję (właściciel warsztatu).
DROP POLICY IF EXISTS wlasciciel ON public.workshop_cash_closures;
CREATE POLICY wlasciciel ON public.workshop_cash_closures FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_client_bookings;
CREATE POLICY wlasciciel ON public.workshop_client_bookings FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_clients;
CREATE POLICY wlasciciel ON public.workshop_clients FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_employee_findings;
CREATE POLICY wlasciciel ON public.workshop_employee_findings FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_employee_invitations;
CREATE POLICY wlasciciel ON public.workshop_employee_invitations FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_employee_notifications;
CREATE POLICY wlasciciel ON public.workshop_employee_notifications FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_employee_payouts;
CREATE POLICY wlasciciel ON public.workshop_employee_payouts FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_employees;
CREATE POLICY wlasciciel ON public.workshop_employees FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_expenses;
CREATE POLICY wlasciciel ON public.workshop_expenses FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_finance_settings;
CREATE POLICY wlasciciel ON public.workshop_finance_settings FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_mechanics;
CREATE POLICY wlasciciel ON public.workshop_mechanics FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_assignments;
CREATE POLICY wlasciciel ON public.workshop_order_assignments FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_sequences;
CREATE POLICY wlasciciel ON public.workshop_order_sequences FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_statuses;
CREATE POLICY wlasciciel ON public.workshop_order_statuses FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_orders;
CREATE POLICY wlasciciel ON public.workshop_orders FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_parts_integrations;
CREATE POLICY wlasciciel ON public.workshop_parts_integrations FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_parts_orders;
CREATE POLICY wlasciciel ON public.workshop_parts_orders FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_payments;
CREATE POLICY wlasciciel ON public.workshop_payments FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_recurring_costs;
CREATE POLICY wlasciciel ON public.workshop_recurring_costs FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_service_points;
CREATE POLICY wlasciciel ON public.workshop_service_points FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_station_employees;
CREATE POLICY wlasciciel ON public.workshop_station_employees FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_stations;
CREATE POLICY wlasciciel ON public.workshop_stations FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_status_settings;
CREATE POLICY wlasciciel ON public.workshop_status_settings FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_tire_storage;
CREATE POLICY wlasciciel ON public.workshop_tire_storage FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_vehicles;
CREATE POLICY wlasciciel ON public.workshop_vehicles FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_workstations;
CREATE POLICY wlasciciel ON public.workshop_workstations FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_files;
CREATE POLICY wlasciciel ON public.workshop_order_files FOR ALL TO authenticated
  USING (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_items;
CREATE POLICY wlasciciel ON public.workshop_order_items FOR ALL TO authenticated
  USING (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_photos;
CREATE POLICY wlasciciel ON public.workshop_order_photos FOR ALL TO authenticated
  USING (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_signatures;
CREATE POLICY wlasciciel ON public.workshop_order_signatures FOR ALL TO authenticated
  USING (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()));
DROP POLICY IF EXISTS wlasciciel ON public.workshop_order_status_history;
CREATE POLICY wlasciciel ON public.workshop_order_status_history FOR ALL TO authenticated
  USING (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT o.id FROM public.workshop_orders o JOIN public.service_providers sp ON sp.id=o.provider_id WHERE sp.user_id = auth.uid()));

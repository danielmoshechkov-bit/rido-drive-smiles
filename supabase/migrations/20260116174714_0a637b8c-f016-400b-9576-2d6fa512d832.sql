-- Brakujące polityki RLS dla modułu USŁUGI

-- service_resources - widoczne publicznie dla aktywnych providerów
CREATE POLICY "Resources are visible for active providers" ON public.service_resources
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND status = 'verified')
  );
CREATE POLICY "Provider owners manage resources" ON public.service_resources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- service_working_hours - widoczne publicznie
CREATE POLICY "Working hours are public" ON public.service_working_hours
  FOR SELECT USING (true);
CREATE POLICY "Provider owners manage working hours" ON public.service_working_hours
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- service_calendar_blocks - widoczne publicznie (dla sprawdzania dostępności)
CREATE POLICY "Calendar blocks are public" ON public.service_calendar_blocks
  FOR SELECT USING (true);
CREATE POLICY "Provider owners manage calendar blocks" ON public.service_calendar_blocks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- service_booking_status_history - widoczne dla właściciela rezerwacji i providera
CREATE POLICY "Booking history visible to parties" ON public.service_booking_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.service_bookings b 
      WHERE b.id = booking_id 
      AND (b.customer_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.service_providers p WHERE p.id = b.provider_id AND p.user_id = auth.uid()
      ))
    )
  );

-- service_notifications - widoczne dla właściciela rezerwacji
CREATE POLICY "Notifications visible to booking owner" ON public.service_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.service_bookings b 
      WHERE b.id = booking_id 
      AND (b.customer_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.service_providers p WHERE p.id = b.provider_id AND p.user_id = auth.uid()
      ))
    )
  );

-- service_customer_notes - tylko provider
CREATE POLICY "Provider manages customer notes" ON public.service_customer_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- loyalty_programs - publiczne do odczytu
CREATE POLICY "Loyalty programs are public" ON public.loyalty_programs
  FOR SELECT USING (is_active = true);

-- sms_settings - tylko admin (na razie brak polityki, dostęp przez funkcje)
CREATE POLICY "SMS settings admin only" ON public.sms_settings
  FOR SELECT USING (false); -- dostęp tylko przez service role
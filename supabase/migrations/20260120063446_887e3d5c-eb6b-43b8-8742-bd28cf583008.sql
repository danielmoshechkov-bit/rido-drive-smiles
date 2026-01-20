-- Ustawienia prowizji (admin)
CREATE TABLE IF NOT EXISTS public.service_commission_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_percent NUMERIC DEFAULT 15,
  is_enabled BOOLEAN DEFAULT false,
  min_amount NUMERIC DEFAULT 0,
  max_amount NUMERIC DEFAULT 10000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Podkategorie (user-created)
CREATE TABLE IF NOT EXISTS public.service_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_category_id UUID REFERENCES public.service_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_by_user_id UUID,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parent_category_id, slug)
);

-- Potwierdzenia usług (dla gotówki)
CREATE TABLE IF NOT EXISTS public.service_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE UNIQUE,
  client_code TEXT NOT NULL,
  client_code_verified_at TIMESTAMPTZ,
  final_price NUMERIC NOT NULL,
  service_description TEXT,
  provider_submitted_at TIMESTAMPTZ DEFAULT now(),
  client_confirmed_at TIMESTAMPTZ,
  client_confirmation_method TEXT CHECK (client_confirmation_method IN ('app', 'email')),
  commission_amount NUMERIC DEFAULT 0,
  commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'paid', 'waived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Wiadomości usług
CREATE TABLE IF NOT EXISTS public.service_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Oczekujące oceny (wymuszanie)
CREATE TABLE IF NOT EXISTS public.pending_service_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE UNIQUE,
  provider_id UUID REFERENCES public.service_providers(id),
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  is_blocking BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Kalendarz użytkownika
CREATE TABLE IF NOT EXISTS public.user_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  event_type TEXT DEFAULT 'personal' CHECK (event_type IN ('personal', 'booking', 'reminder')),
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3b82f6',
  location TEXT,
  is_public BOOLEAN DEFAULT false,
  shared_with_users UUID[],
  reminder_before_minutes INTEGER DEFAULT 60,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Potwierdzenia przypomnień przez wykonawców
CREATE TABLE IF NOT EXISTS public.provider_reminder_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.service_providers(id),
  reminder_type TEXT CHECK (reminder_type IN ('day_before', 'hours_before')),
  confirmed_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ DEFAULT now(),
  resend_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: generuj kod klienta
CREATE OR REPLACE FUNCTION generate_client_confirmation_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.client_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_client_confirmation_code ON public.service_confirmations;
CREATE TRIGGER set_client_confirmation_code
  BEFORE INSERT ON public.service_confirmations
  FOR EACH ROW EXECUTE FUNCTION generate_client_confirmation_code();

-- Trigger: utwórz pending review po zakończeniu usługi (używamy customer_user_id)
CREATE OR REPLACE FUNCTION create_pending_service_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.pending_service_reviews (user_id, booking_id, provider_id)
    VALUES (NEW.customer_user_id, NEW.id, NEW.provider_id)
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS create_pending_review_on_complete ON public.service_bookings;
CREATE TRIGGER create_pending_review_on_complete
  AFTER UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION create_pending_service_review();

-- Trigger: usuń pending review po dodaniu oceny
CREATE OR REPLACE FUNCTION remove_pending_service_review()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.pending_service_reviews WHERE booking_id = NEW.booking_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS remove_pending_review_on_add ON public.service_reviews;
CREATE TRIGGER remove_pending_review_on_add
  AFTER INSERT ON public.service_reviews
  FOR EACH ROW EXECUTE FUNCTION remove_pending_service_review();

-- RLS
ALTER TABLE public.service_commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_service_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_reminder_confirmations ENABLE ROW LEVEL SECURITY;

-- Commission settings policies
DROP POLICY IF EXISTS "Admin can manage commission settings" ON public.service_commission_settings;
CREATE POLICY "Admin can manage commission settings" ON public.service_commission_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Anyone can view commission settings" ON public.service_commission_settings;
CREATE POLICY "Anyone can view commission settings" ON public.service_commission_settings
  FOR SELECT USING (true);

-- Subcategories policies
DROP POLICY IF EXISTS "Anyone can view approved subcategories" ON public.service_subcategories;
CREATE POLICY "Anyone can view approved subcategories" ON public.service_subcategories
  FOR SELECT USING (is_approved = true);

DROP POLICY IF EXISTS "Users can create subcategories" ON public.service_subcategories;
CREATE POLICY "Users can create subcategories" ON public.service_subcategories
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin can manage subcategories" ON public.service_subcategories;
CREATE POLICY "Admin can manage subcategories" ON public.service_subcategories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Confirmations policies (używamy customer_user_id)
DROP POLICY IF EXISTS "Participants can view confirmations" ON public.service_confirmations;
CREATE POLICY "Participants can view confirmations" ON public.service_confirmations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.service_bookings b 
      WHERE b.id = booking_id AND (
        b.customer_user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.service_providers WHERE id = b.provider_id AND user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Provider can create confirmations" ON public.service_confirmations;
CREATE POLICY "Provider can create confirmations" ON public.service_confirmations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_bookings b 
      JOIN public.service_providers p ON p.id = b.provider_id
      WHERE b.id = booking_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can update confirmations" ON public.service_confirmations;
CREATE POLICY "Participants can update confirmations" ON public.service_confirmations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.service_bookings b 
      WHERE b.id = booking_id AND (
        b.customer_user_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.service_providers WHERE id = b.provider_id AND user_id = auth.uid())
      )
    )
  );

-- Messages policies
DROP POLICY IF EXISTS "Users can view own messages" ON public.service_messages;
CREATE POLICY "Users can view own messages" ON public.service_messages
  FOR SELECT USING (sender_user_id = auth.uid() OR recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can send messages" ON public.service_messages;
CREATE POLICY "Users can send messages" ON public.service_messages
  FOR INSERT WITH CHECK (sender_user_id = auth.uid());

DROP POLICY IF EXISTS "Recipients can mark as read" ON public.service_messages;
CREATE POLICY "Recipients can mark as read" ON public.service_messages
  FOR UPDATE USING (recipient_user_id = auth.uid());

-- Pending reviews policies
DROP POLICY IF EXISTS "Users can view own pending reviews" ON public.pending_service_reviews;
CREATE POLICY "Users can view own pending reviews" ON public.pending_service_reviews
  FOR SELECT USING (user_id = auth.uid());

-- Calendar events policies
DROP POLICY IF EXISTS "Users can view own or shared events" ON public.user_calendar_events;
CREATE POLICY "Users can view own or shared events" ON public.user_calendar_events
  FOR SELECT USING (
    user_id = auth.uid() OR 
    is_public = true OR 
    auth.uid() = ANY(shared_with_users)
  );

DROP POLICY IF EXISTS "Users can manage own events" ON public.user_calendar_events;
CREATE POLICY "Users can manage own events" ON public.user_calendar_events
  FOR ALL USING (user_id = auth.uid());

-- Provider reminders policies
DROP POLICY IF EXISTS "Providers can view own reminders" ON public.provider_reminder_confirmations;
CREATE POLICY "Providers can view own reminders" ON public.provider_reminder_confirmations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Providers can confirm reminders" ON public.provider_reminder_confirmations;
CREATE POLICY "Providers can confirm reminders" ON public.provider_reminder_confirmations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- Insert default commission settings if not exists
INSERT INTO public.service_commission_settings (commission_percent, is_enabled)
SELECT 15, false
WHERE NOT EXISTS (SELECT 1 FROM public.service_commission_settings);
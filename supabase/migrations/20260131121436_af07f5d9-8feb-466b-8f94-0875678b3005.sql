-- =========================================
-- PHASE 1: Calendar & Booking Module
-- Database schema and feature flags
-- =========================================

-- Feature flags for Calendar module
INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled, description, category) VALUES
('module_calendar_enabled', 'Moduł Kalendarz', true, 'Główny moduł kalendarza i rezerwacji', 'calendar'),
('calendar_public_booking_enabled', 'Publiczne rezerwacje', true, 'Publiczne linki do rezerwacji', 'calendar'),
('calendar_sms_reminders_enabled', 'Przypomnienia SMS', true, 'Przypomnienia SMS dla rezerwacji', 'calendar'),
('calendar_email_reminders_enabled', 'Przypomnienia email', true, 'Przypomnienia email dla rezerwacji', 'calendar'),
('calendar_resources_enabled', 'Zasoby/Pracownicy', true, 'Zarządzanie pracownikami/stanowiskami', 'calendar'),
('calendar_payments_placeholder_enabled', 'Płatności (placeholder)', false, 'Placeholder dla płatności', 'calendar'),
('calendar_ai_assistant_enabled', 'AI Asystent', false, 'AI Asystent kalendarza', 'calendar')
ON CONFLICT (feature_key) DO UPDATE SET feature_name = EXCLUDED.feature_name, description = EXCLUDED.description;

-- 1. CALENDAR CALENDARS - główna tabela kalendarzy
CREATE TABLE IF NOT EXISTS public.calendar_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'company', 'service_provider')),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Mój kalendarz',
  description TEXT,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  color TEXT DEFAULT '#8b5cf6',
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CALENDAR EVENTS - wydarzenia w kalendarzach
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES public.calendar_calendars(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('private_event', 'booking', 'blocked_time', 'reminder', 'task')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  location_url TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  recurrence_end_date TIMESTAMPTZ,
  recurrence_exception_dates TIMESTAMPTZ[],
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'cancelled', 'completed', 'no_show')),
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'busy_only')),
  color TEXT,
  reminder_minutes INTEGER[] DEFAULT ARRAY[1440, 120],
  created_by_user_id UUID,
  booking_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. BOOKING SERVICES - usługi do rezerwacji
CREATE TABLE IF NOT EXISTS public.booking_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  buffer_before_minutes INTEGER DEFAULT 0,
  buffer_after_minutes INTEGER DEFAULT 0,
  price_net NUMERIC(10,2),
  price_gross NUMERIC(10,2),
  currency TEXT DEFAULT 'PLN',
  is_active BOOLEAN DEFAULT true,
  max_capacity INTEGER DEFAULT 1,
  requires_confirmation BOOLEAN DEFAULT false,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. BOOKING RESOURCES - pracownicy/stanowiska/zasoby
CREATE TABLE IF NOT EXISTS public.booking_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('staff', 'room', 'vehicle', 'station', 'equipment')),
  name TEXT NOT NULL,
  description TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  user_id UUID,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. BOOKING RESOURCE SERVICES
CREATE TABLE IF NOT EXISTS public.booking_resource_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.booking_services(id) ON DELETE CASCADE,
  custom_duration_minutes INTEGER,
  custom_price_net NUMERIC(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(resource_id, service_id)
);

-- 6. BOOKING AVAILABILITY RULES
CREATE TABLE IF NOT EXISTS public.booking_availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  resource_id UUID REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('working_hours', 'break', 'day_off', 'holiday', 'override')),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  specific_date DATE,
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN DEFAULT true,
  name TEXT,
  recurrence_rule TEXT,
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. BOOKING AVAILABILITY CONFIG
CREATE TABLE IF NOT EXISTS public.booking_availability_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  resource_id UUID REFERENCES public.booking_resources(id) ON DELETE CASCADE,
  min_booking_notice_hours INTEGER DEFAULT 2,
  max_booking_advance_days INTEGER DEFAULT 60,
  slot_duration_minutes INTEGER DEFAULT 30,
  slot_increment_minutes INTEGER DEFAULT 15,
  allow_same_day_booking BOOLEAN DEFAULT true,
  auto_confirm BOOLEAN DEFAULT true,
  buffer_between_bookings_minutes INTEGER DEFAULT 0,
  max_bookings_per_day INTEGER,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. BOOKING APPOINTMENTS
CREATE TABLE IF NOT EXISTS public.booking_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number TEXT UNIQUE,
  company_id UUID,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.booking_services(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES public.booking_resources(id) ON DELETE SET NULL,
  calendar_id UUID REFERENCES public.calendar_calendars(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  user_id UUID,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_snapshot JSONB DEFAULT '{}',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  notes TEXT,
  internal_notes TEXT,
  price_net NUMERIC(10,2),
  price_gross NUMERIC(10,2),
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
  consent_marketing BOOLEAN DEFAULT false,
  consent_sms BOOLEAN DEFAULT true,
  consent_email BOOLEAN DEFAULT true,
  consent_snapshot JSONB DEFAULT '{}',
  source TEXT DEFAULT 'public_link' CHECK (source IN ('public_link', 'internal', 'phone', 'walk_in', 'api')),
  reminder_sent_24h BOOLEAN DEFAULT false,
  reminder_sent_2h BOOLEAN DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger dla booking_number
CREATE OR REPLACE FUNCTION public.generate_booking_appointment_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.booking_number := 'BK-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || 
    LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS set_booking_appointment_number ON public.booking_appointments;
CREATE TRIGGER set_booking_appointment_number
  BEFORE INSERT ON public.booking_appointments
  FOR EACH ROW EXECUTE FUNCTION public.generate_booking_appointment_number();

-- 9. BOOKING PUBLIC LINKS
CREATE TABLE IF NOT EXISTS public.booking_public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  name TEXT,
  is_enabled BOOLEAN DEFAULT true,
  allowed_services UUID[] DEFAULT '{}',
  allowed_resources UUID[] DEFAULT '{}',
  custom_message TEXT,
  custom_css TEXT,
  logo_url TEXT,
  require_login BOOLEAN DEFAULT false,
  captcha_enabled BOOLEAN DEFAULT true,
  max_bookings_per_day INTEGER,
  max_bookings_per_ip_per_day INTEGER DEFAULT 10,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  booking_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. NOTIFICATION JOBS
CREATE TABLE IF NOT EXISTS public.booking_notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  provider_id UUID,
  appointment_id UUID REFERENCES public.booking_appointments(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  notification_type TEXT NOT NULL CHECK (notification_type IN ('confirmation', 'reminder_24h', 'reminder_2h', 'cancellation', 'reschedule', 'custom')),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'provider', 'resource')),
  recipient_email TEXT,
  recipient_phone TEXT,
  recipient_user_id UUID,
  subject TEXT,
  body TEXT,
  template_id TEXT,
  template_data JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  provider_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. CALENDAR USER SETTINGS
CREATE TABLE IF NOT EXISTS public.calendar_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  default_view TEXT DEFAULT 'week' CHECK (default_view IN ('day', 'week', 'month', 'agenda', 'schedule')),
  week_starts_on INTEGER DEFAULT 1 CHECK (week_starts_on >= 0 AND week_starts_on <= 6),
  time_format TEXT DEFAULT '24h' CHECK (time_format IN ('12h', '24h')),
  timezone TEXT DEFAULT 'Europe/Warsaw',
  show_weekends BOOLEAN DEFAULT true,
  show_declined BOOLEAN DEFAULT false,
  default_event_duration_minutes INTEGER DEFAULT 60,
  reminder_defaults INTEGER[] DEFAULT ARRAY[1440, 120],
  notification_email BOOLEAN DEFAULT true,
  notification_sms BOOLEAN DEFAULT true,
  notification_push BOOLEAN DEFAULT true,
  notification_in_app BOOLEAN DEFAULT true,
  working_hours_start TIME DEFAULT '09:00',
  working_hours_end TIME DEFAULT '17:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. CALENDAR ADMIN SETTINGS
CREATE TABLE IF NOT EXISTS public.calendar_admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Domyślne ustawienia admina
INSERT INTO public.calendar_admin_settings (setting_key, setting_value, description) VALUES
('notification_channels', '{"email": true, "sms": true, "push": false, "in_app": true}', 'Dostępne kanały powiadomień'),
('reminder_defaults', '{"reminder_24h": true, "reminder_2h": true, "custom": false}', 'Domyślne przypomnienia'),
('sms_provider', '{"provider": "smsapi", "enabled": true}', 'Konfiguracja SMS'),
('email_provider', '{"provider": "resend", "enabled": true}', 'Konfiguracja email'),
('booking_defaults', '{"require_confirmation": false, "auto_confirm": true, "allow_cancellation": true, "cancellation_notice_hours": 24}', 'Domyślne ustawienia rezerwacji')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_calendar_calendars_owner ON public.calendar_calendars(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar ON public.calendar_events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON public.calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON public.calendar_events(status);
CREATE INDEX IF NOT EXISTS idx_booking_services_provider ON public.booking_services(provider_id);
CREATE INDEX IF NOT EXISTS idx_booking_resources_provider ON public.booking_resources(provider_id);
CREATE INDEX IF NOT EXISTS idx_booking_appointments_provider ON public.booking_appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_booking_appointments_start ON public.booking_appointments(start_at);
CREATE INDEX IF NOT EXISTS idx_booking_appointments_status ON public.booking_appointments(status);
CREATE INDEX IF NOT EXISTS idx_booking_appointments_customer ON public.booking_appointments(customer_email, customer_phone);
CREATE INDEX IF NOT EXISTS idx_booking_notification_jobs_scheduled ON public.booking_notification_jobs(scheduled_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_booking_public_links_slug ON public.booking_public_links(slug);

-- RLS POLICIES
ALTER TABLE public.calendar_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_resource_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_availability_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_notification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_admin_settings ENABLE ROW LEVEL SECURITY;

-- Calendar policies
CREATE POLICY "Users can view own calendars" ON public.calendar_calendars
  FOR SELECT USING (
    owner_type = 'user' AND owner_id = auth.uid()
    OR is_public = true
  );

CREATE POLICY "Users can create own calendars" ON public.calendar_calendars
  FOR INSERT WITH CHECK (owner_type = 'user' AND owner_id = auth.uid());

CREATE POLICY "Users can update own calendars" ON public.calendar_calendars
  FOR UPDATE USING (owner_type = 'user' AND owner_id = auth.uid());

CREATE POLICY "Users can delete own calendars" ON public.calendar_calendars
  FOR DELETE USING (owner_type = 'user' AND owner_id = auth.uid());

-- Events policies
CREATE POLICY "Users can view events in their calendars" ON public.calendar_events
  FOR SELECT USING (
    calendar_id IN (SELECT id FROM public.calendar_calendars WHERE owner_type = 'user' AND owner_id = auth.uid())
    OR visibility = 'public'
  );

CREATE POLICY "Users can create events in own calendars" ON public.calendar_events
  FOR INSERT WITH CHECK (
    calendar_id IN (SELECT id FROM public.calendar_calendars WHERE owner_type = 'user' AND owner_id = auth.uid())
  );

CREATE POLICY "Users can update own events" ON public.calendar_events
  FOR UPDATE USING (created_by_user_id = auth.uid());

CREATE POLICY "Users can delete own events" ON public.calendar_events
  FOR DELETE USING (created_by_user_id = auth.uid());

-- User settings policy
CREATE POLICY "Users can manage own calendar settings" ON public.calendar_user_settings
  FOR ALL USING (user_id = auth.uid());

-- Booking appointments
CREATE POLICY "Users can view own appointments" ON public.booking_appointments
  FOR SELECT USING (user_id = auth.uid() OR customer_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Public read for booking services and resources
CREATE POLICY "Public can view active booking services" ON public.booking_services
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view active booking resources" ON public.booking_resources
  FOR SELECT USING (is_active = true);

-- Public links
CREATE POLICY "Public can view enabled booking links" ON public.booking_public_links
  FOR SELECT USING (is_enabled = true);

-- Admin settings
CREATE POLICY "Admins can manage calendar admin settings" ON public.calendar_admin_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Triggers for updated_at
CREATE TRIGGER set_calendar_calendars_updated_at
  BEFORE UPDATE ON public.calendar_calendars
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_booking_services_updated_at
  BEFORE UPDATE ON public.booking_services
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_booking_resources_updated_at
  BEFORE UPDATE ON public.booking_resources
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_booking_availability_rules_updated_at
  BEFORE UPDATE ON public.booking_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_booking_availability_config_updated_at
  BEFORE UPDATE ON public.booking_availability_config
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_booking_appointments_updated_at
  BEFORE UPDATE ON public.booking_appointments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_booking_public_links_updated_at
  BEFORE UPDATE ON public.booking_public_links
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_calendar_user_settings_updated_at
  BEFORE UPDATE ON public.calendar_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_calendar_admin_settings_updated_at
  BEFORE UPDATE ON public.calendar_admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
-- ============================================
-- MODUŁ USŁUGI - FUNDAMENT BAZY DANYCH
-- ============================================

-- 1. KATEGORIE USŁUG (branże)
CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. USŁUGODAWCY (warsztaty, firmy sprzątające, detailing, etc.)
CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  category_id UUID REFERENCES public.service_categories(id),
  
  -- Dane firmy
  company_name TEXT NOT NULL,
  company_nip TEXT,
  company_regon TEXT,
  company_address TEXT,
  company_city TEXT,
  company_postal_code TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_website TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  description TEXT,
  
  -- Właściciel
  owner_first_name TEXT,
  owner_last_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  
  -- Lokalizacja (dla wyszukiwania)
  latitude NUMERIC,
  longitude NUMERIC,
  
  -- Statystyki
  rating_avg NUMERIC DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, verified, suspended
  verified_at TIMESTAMPTZ,
  
  -- Ustawienia
  booking_advance_days INTEGER DEFAULT 30, -- ile dni do przodu można rezerwować
  cancellation_hours INTEGER DEFAULT 24, -- ile godzin przed można anulować
  auto_confirm BOOLEAN DEFAULT false, -- automatyczne potwierdzanie rezerwacji
  
  -- Lojalnościówka
  loyalty_enabled BOOLEAN DEFAULT false,
  loyalty_type TEXT, -- 'points', 'visits', 'discount'
  loyalty_config JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PRACOWNICY USŁUGODAWCY
CREATE TABLE IF NOT EXISTS public.service_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'employee', -- owner, manager, employee
  specializations TEXT[], -- np. ['mechanik', 'elektryk']
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. USŁUGI OFEROWANE
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- podkategoria np. 'wymiana opon', 'sprzątanie standardowe'
  
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price NUMERIC,
  price_from NUMERIC, -- cena od (gdy zmienna)
  price_type TEXT DEFAULT 'fixed', -- fixed, from, hourly, free_quote
  
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. STANOWISKA / ZASOBY (np. stanowisko w warsztacie, pokój)
CREATE TABLE IF NOT EXISTS public.service_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL, -- np. "Stanowisko 1", "Gabinet A"
  description TEXT,
  capacity INTEGER DEFAULT 1,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. GODZINY PRACY (weekly schedule)
CREATE TABLE IF NOT EXISTS public.service_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.service_employees(id) ON DELETE CASCADE,
  
  day_of_week INTEGER NOT NULL, -- 0=niedziela, 1=poniedziałek, etc.
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_working BOOLEAN DEFAULT true,
  
  UNIQUE(provider_id, employee_id, day_of_week)
);

-- 7. BLOKADY KALENDARZA (urlopy, przerwy)
CREATE TABLE IF NOT EXISTS public.service_calendar_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.service_employees(id) ON DELETE CASCADE,
  resource_id UUID REFERENCES public.service_resources(id) ON DELETE CASCADE,
  
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  reason TEXT,
  block_type TEXT DEFAULT 'unavailable', -- unavailable, holiday, break
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. REZERWACJE / WIZYTY
CREATE TABLE IF NOT EXISTS public.service_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number TEXT UNIQUE NOT NULL,
  
  provider_id UUID REFERENCES public.service_providers(id),
  service_id UUID REFERENCES public.services(id),
  employee_id UUID REFERENCES public.service_employees(id),
  resource_id UUID REFERENCES public.service_resources(id),
  
  -- Klient
  customer_user_id UUID REFERENCES auth.users(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT NOT NULL,
  
  -- Termin
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  
  -- Cena
  estimated_price NUMERIC,
  final_price NUMERIC,
  
  -- Status
  status TEXT DEFAULT 'new', 
  -- new, pending_confirmation, confirmed, in_progress, completed, cancelled, no_show
  
  -- Notatki
  customer_notes TEXT,
  provider_notes TEXT,
  
  -- Lojalnościówka
  loyalty_points_earned INTEGER DEFAULT 0,
  
  -- Timestamps
  confirmed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. HISTORIA STATUSÓW REZERWACJI
CREATE TABLE IF NOT EXISTS public.service_booking_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. POWIADOMIENIA
CREATE TABLE IF NOT EXISTS public.service_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE CASCADE,
  
  channel TEXT NOT NULL, -- email, sms
  notification_type TEXT NOT NULL, 
  -- booking_confirmed, reminder_24h, reminder_2h, status_changed, booking_completed
  
  recipient_email TEXT,
  recipient_phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  scheduled_for TIMESTAMPTZ, -- dla przypomnień
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. OCENY I OPINIE
CREATE TABLE IF NOT EXISTS public.service_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.service_bookings(id) UNIQUE,
  provider_id UUID REFERENCES public.service_providers(id),
  customer_user_id UUID REFERENCES auth.users(id),
  
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  
  provider_response TEXT,
  provider_response_at TIMESTAMPTZ,
  
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. KLIENCI USŁUGODAWCY (CRM)
CREATE TABLE IF NOT EXISTS public.service_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- CRM fields
  notes TEXT,
  tags TEXT[],
  
  -- Stats
  total_visits INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  
  -- Lojalnościówka
  loyalty_points INTEGER DEFAULT 0,
  loyalty_visits INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. NOTATKI CRM
CREATE TABLE IF NOT EXISTS public.service_customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.service_customers(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. USTAWIENIA LOJALNOŚCIOWE (globalne admin)
CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  program_type TEXT NOT NULL, -- points, visits, discount
  description TEXT,
  
  config JSONB NOT NULL,
  -- dla points: { "points_per_pln": 1, "pln_per_point": 0.01 }
  -- dla visits: { "visits_required": 10, "reward": "free_service" }
  -- dla discount: { "discount_percent": 10, "min_visits": 5 }
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. USTAWIENIA SMS (admin)
CREATE TABLE IF NOT EXISTS public.sms_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  provider TEXT NOT NULL, -- np. 'smsapi', 'twilio'
  api_url TEXT,
  api_key_secret_name TEXT, -- nazwa sekretu w Supabase secrets
  sender_name TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

-- Kategorie - publiczne do odczytu
CREATE POLICY "Categories are public" ON public.service_categories FOR SELECT USING (true);

-- Usługodawcy - publiczne weryfikowane, własne wszystkie
CREATE POLICY "Verified providers are public" ON public.service_providers 
  FOR SELECT USING (status = 'verified' OR user_id = auth.uid());
CREATE POLICY "Users can create own provider" ON public.service_providers 
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own provider" ON public.service_providers 
  FOR UPDATE USING (user_id = auth.uid());

-- Pracownicy - widoczni dla provider owners
CREATE POLICY "Provider owners can manage employees" ON public.service_employees
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );
CREATE POLICY "Employees see own profile" ON public.service_employees
  FOR SELECT USING (user_id = auth.uid());

-- Usługi - publiczne dla aktywnych providerów
CREATE POLICY "Active services are public" ON public.services
  FOR SELECT USING (
    is_active = true AND 
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND status = 'verified')
  );
CREATE POLICY "Provider owners manage services" ON public.services
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- Rezerwacje - klient widzi swoje, provider widzi swoje
CREATE POLICY "Customers see own bookings" ON public.service_bookings
  FOR SELECT USING (customer_user_id = auth.uid());
CREATE POLICY "Providers see their bookings" ON public.service_bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );
CREATE POLICY "Anyone can create booking" ON public.service_bookings
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Providers can update bookings" ON public.service_bookings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
    OR customer_user_id = auth.uid()
  );

-- Recenzje - publiczne do odczytu
CREATE POLICY "Reviews are public" ON public.service_reviews
  FOR SELECT USING (is_visible = true);
CREATE POLICY "Customers can create reviews" ON public.service_reviews
  FOR INSERT WITH CHECK (customer_user_id = auth.uid());

-- CRM Customers - tylko provider
CREATE POLICY "Provider manages customers" ON public.service_customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers WHERE id = provider_id AND user_id = auth.uid())
  );

-- ============================================
-- FUNKCJE POMOCNICZE
-- ============================================

-- Generowanie numeru rezerwacji
CREATE OR REPLACE FUNCTION public.generate_booking_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.booking_number := 'BK-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || 
    LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_booking_number
  BEFORE INSERT ON public.service_bookings
  FOR EACH ROW
  WHEN (NEW.booking_number IS NULL)
  EXECUTE FUNCTION public.generate_booking_number();

-- Aktualizacja statystyk providera po recenzji
CREATE OR REPLACE FUNCTION public.update_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.service_providers
  SET 
    rating_avg = (SELECT AVG(rating) FROM public.service_reviews WHERE provider_id = NEW.provider_id AND is_visible = true),
    rating_count = (SELECT COUNT(*) FROM public.service_reviews WHERE provider_id = NEW.provider_id AND is_visible = true)
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_review_insert
  AFTER INSERT ON public.service_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_provider_rating();

-- Historia statusów
CREATE OR REPLACE FUNCTION public.log_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.service_booking_status_history (booking_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_booking_status_change
  AFTER UPDATE ON public.service_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_booking_status_change();

-- Aktualizacja updated_at
CREATE OR REPLACE FUNCTION public.update_service_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_providers_updated_at
  BEFORE UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_service_updated_at();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_service_updated_at();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_service_updated_at();

-- ============================================
-- DANE STARTOWE - KATEGORIE
-- ============================================

INSERT INTO public.service_categories (slug, name, icon, description, sort_order) VALUES
  ('warsztat', 'Warsztaty samochodowe', 'wrench', 'Naprawy, przeglądy, wymiana opon', 1),
  ('detailing', 'Auto detailing', 'sparkles', 'Mycie, polerowanie, kosmetyka auta', 2),
  ('sprzatanie', 'Sprzątanie', 'home', 'Sprzątanie domów, biur, po remontach', 3),
  ('zlota-raczka', 'Złota rączka', 'hammer', 'Drobne naprawy domowe, montaż', 4),
  ('hydraulik', 'Hydraulik', 'droplets', 'Instalacje wodno-kanalizacyjne', 5),
  ('elektryk', 'Elektryk', 'zap', 'Instalacje elektryczne', 6),
  ('ogrodnik', 'Ogrodnik', 'flower', 'Pielęgnacja ogrodów i zieleni', 7),
  ('przeprowadzki', 'Przeprowadzki', 'truck', 'Transport, przeprowadzki', 8)
ON CONFLICT (slug) DO NOTHING;
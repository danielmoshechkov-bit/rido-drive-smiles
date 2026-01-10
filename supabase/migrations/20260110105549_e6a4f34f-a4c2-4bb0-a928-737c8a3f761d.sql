-- Create paid_services table
CREATE TABLE public.paid_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_pln NUMERIC(10,2) NOT NULL DEFAULT 0,
  pricing_type TEXT NOT NULL DEFAULT 'monthly',
  is_active BOOLEAN DEFAULT false,
  category TEXT DEFAULT 'other',
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create paid_service_subscriptions table
CREATE TABLE public.paid_service_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.paid_services(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add new columns to ai_settings for API provider configuration
ALTER TABLE public.ai_settings
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'lovable',
ADD COLUMN IF NOT EXISTS custom_api_key_encrypted TEXT;

-- Enable RLS
ALTER TABLE public.paid_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_service_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for paid_services (admin read/write, public read active)
CREATE POLICY "Anyone can view active paid services"
  ON public.paid_services FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage paid services"
  ON public.paid_services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = (SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid())
      AND d.user_role = 'admin'
    )
  );

-- RLS policies for paid_service_subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON public.paid_service_subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own subscriptions"
  ON public.paid_service_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all subscriptions"
  ON public.paid_service_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = (SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid())
      AND d.user_role = 'admin'
    )
  );

-- Insert default paid services
INSERT INTO public.paid_services (name, description, price_pln, pricing_type, category, is_active) VALUES
  ('AI Wyszukiwarka - Pakiet kredytów', 'Kredyty na zapytania AI w wyszukiwarce', 9.99, 'one_time', 'ai', true),
  ('AI Obsługa sprzedawcy', 'Automatyczne odpowiedzi AI na pytania klientów', 29.99, 'monthly', 'ai', false),
  ('Wyróżnienie ogłoszenia', 'Ogłoszenie wyświetlane na górze listy', 19.99, 'one_time', 'promotion', false),
  ('Boost ogłoszenia', 'Zwiększona widoczność ogłoszenia przez 7 dni', 9.99, 'one_time', 'promotion', false);

-- Create updated_at trigger for paid_services
CREATE TRIGGER update_paid_services_updated_at
  BEFORE UPDATE ON public.paid_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- =============================================
-- AI SYSTEM TABLES FOR GETRIDO
-- =============================================

-- 1. AI Settings (global configuration)
CREATE TABLE public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_model TEXT DEFAULT 'google/gemini-3-flash-preview',
  system_prompt TEXT DEFAULT 'Jesteś "Ludkiem GetRido" - inteligentnym asystentem wyszukiwania na portalu GetRido. Pomagasz użytkownikom znaleźć pojazdy do wynajmu lub zakupu. Analizujesz zapytania w języku naturalnym i zamieniasz je na filtry wyszukiwania. Odpowiadaj zawsze po polsku, krótko i konkretnie.',
  guest_daily_limit INTEGER DEFAULT 3,
  user_monthly_limit INTEGER DEFAULT 50,
  ai_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings
INSERT INTO public.ai_settings (id) VALUES (gen_random_uuid());

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/update settings
CREATE POLICY "Admins can read ai_settings"
  ON public.ai_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ai_settings"
  ON public.ai_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. AI Credit Packages
CREATE TABLE public.ai_credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_pln NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default packages
INSERT INTO public.ai_credit_packages (name, credits, price_pln, sort_order) VALUES
  ('Starter', 100, 19.99, 1),
  ('Pro', 250, 39.99, 2),
  ('Business', 500, 69.99, 3);

ALTER TABLE public.ai_credit_packages ENABLE ROW LEVEL SECURITY;

-- Anyone can read active packages
CREATE POLICY "Anyone can read active ai_credit_packages"
  ON public.ai_credit_packages FOR SELECT
  USING (is_active = true);

-- Admins can manage packages
CREATE POLICY "Admins can manage ai_credit_packages"
  ON public.ai_credit_packages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. AI Query Costs
CREATE TABLE public.ai_query_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_type TEXT NOT NULL UNIQUE,
  cost_credits INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default costs
INSERT INTO public.ai_query_costs (query_type, cost_credits, description) VALUES
  ('search', 1, 'Proste wyszukiwanie AI'),
  ('advice', 3, 'Doradztwo i porównania'),
  ('admin_action', 5, 'Akcje administracyjne');

ALTER TABLE public.ai_query_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ai_query_costs"
  ON public.ai_query_costs FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage ai_query_costs"
  ON public.ai_query_costs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. User AI Credits
CREATE TABLE public.ai_user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_balance INTEGER DEFAULT 0,
  monthly_free_used INTEGER DEFAULT 0,
  monthly_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.ai_user_credits ENABLE ROW LEVEL SECURITY;

-- Users can read their own credits
CREATE POLICY "Users can read own ai_user_credits"
  ON public.ai_user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can read all ai_user_credits"
  ON public.ai_user_credits FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. AI Credit History
CREATE TABLE public.ai_credit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query_type TEXT NOT NULL,
  credits_used INTEGER NOT NULL,
  query_summary TEXT,
  was_free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_credit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai_credit_history"
  ON public.ai_credit_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all ai_credit_history"
  ON public.ai_credit_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. Guest AI Usage (rate limiting)
CREATE TABLE public.ai_guest_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  device_fingerprint TEXT,
  usage_date DATE DEFAULT CURRENT_DATE,
  query_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ip_address, device_fingerprint, usage_date)
);

ALTER TABLE public.ai_guest_usage ENABLE ROW LEVEL SECURITY;

-- Only service role can manage guest usage (via edge functions)
CREATE POLICY "Service role manages ai_guest_usage"
  ON public.ai_guest_usage FOR ALL
  USING (true);

-- 7. AI Admin Audit Log
CREATE TABLE public.ai_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  action_details JSONB NOT NULL DEFAULT '{}',
  affected_entities JSONB,
  ai_conversation_id UUID,
  requires_confirmation BOOLEAN DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai_admin_audit_log"
  ON public.ai_admin_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert ai_admin_audit_log"
  ON public.ai_admin_audit_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 8. AI Knowledge Base (for chat support)
CREATE TABLE public.ai_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  keywords TEXT[],
  is_active BOOLEAN DEFAULT true,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Anyone can read active knowledge base entries (for AI to use)
CREATE POLICY "Anyone can read active ai_knowledge_base"
  ON public.ai_knowledge_base FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage ai_knowledge_base"
  ON public.ai_knowledge_base FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert some default FAQ entries
INSERT INTO public.ai_knowledge_base (question, answer, category, keywords) VALUES
  ('Jak wynająć samochód?', 'Aby wynająć samochód, przejdź do sekcji Marketplace, wybierz interesujący Cię pojazd i kliknij "Rezerwuj". Następnie skontaktuj się z właścicielem floty.', 'wynajem', ARRAY['wynajem', 'samochód', 'rezerwacja']),
  ('Jak sprawdzić swoje rozliczenie?', 'Twoje rozliczenia znajdziesz w zakładce "Rozliczenia" w panelu kierowcy. Wybierz tydzień z listy, aby zobaczyć szczegóły.', 'rozliczenia', ARRAY['rozliczenie', 'wypłata', 'zarobki']),
  ('Jak zmienić plan rozliczeń?', 'Plan rozliczeń możesz zmienić w ustawieniach konta. Pamiętaj, że zmiana jest możliwa raz na 30 dni.', 'plany', ARRAY['plan', 'zmiana', 'rozliczenie']);

-- 9. Add ai_generated flag to existing messages table (for chat support)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'driver_communications' 
                 AND column_name = 'ai_generated') THEN
    ALTER TABLE public.driver_communications ADD COLUMN ai_generated BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'driver_communications' 
                 AND column_name = 'escalated_to') THEN
    ALTER TABLE public.driver_communications ADD COLUMN escalated_to UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 10. Update triggers for timestamps
CREATE OR REPLACE FUNCTION public.update_ai_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_ai_settings_timestamp
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_settings_updated_at();

CREATE TRIGGER update_ai_user_credits_timestamp
  BEFORE UPDATE ON public.ai_user_credits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_knowledge_base_timestamp
  BEFORE UPDATE ON public.ai_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
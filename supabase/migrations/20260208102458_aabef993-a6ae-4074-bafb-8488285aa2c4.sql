-- =====================================================
-- SEKCJA 0: DIAGNOSTYKA BUGÓW
-- =====================================================

-- Tabela diagnostyki importów rozliczeń
CREATE TABLE IF NOT EXISTS public.settlement_import_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id),
  import_timestamp TIMESTAMPTZ DEFAULT now(),
  platform TEXT NOT NULL,
  csv_row_number INTEGER,
  raw_driver_name TEXT,
  raw_platform_id TEXT,
  raw_phone TEXT,
  raw_email TEXT,
  match_result TEXT,
  match_score INTEGER,
  matched_driver_id UUID REFERENCES drivers(id),
  created_driver_id UUID REFERENCES drivers(id),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indeksy dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_settlement_diagnostics_fleet ON public.settlement_import_diagnostics(fleet_id);
CREATE INDEX IF NOT EXISTS idx_settlement_diagnostics_timestamp ON public.settlement_import_diagnostics(import_timestamp DESC);

-- RLS dla diagnostyki
ALTER TABLE public.settlement_import_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet managers can view their diagnostics" ON public.settlement_import_diagnostics;
CREATE POLICY "Fleet managers can view their diagnostics"
ON public.settlement_import_diagnostics
FOR SELECT
USING (
  fleet_id IN (
    SELECT fleet_id FROM user_roles WHERE user_id = auth.uid()
  )
);

-- Dodaj kolumny do istniejącej tabeli fuel_cards jeśli brakuje
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'fuel_cards' 
    AND column_name = 'card_number_normalized'
  ) THEN
    ALTER TABLE public.fuel_cards ADD COLUMN card_number_normalized TEXT GENERATED ALWAYS AS (LTRIM(card_number, '0')) STORED;
  END IF;
END $$;

-- =====================================================
-- SEKCJA 1: MODUŁ TWORZENIA STRON WWW
-- =====================================================

-- Główna tabela projektów stron WWW
CREATE TABLE IF NOT EXISTS public.website_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider_id UUID REFERENCES service_providers(id),
  package_type TEXT NOT NULL CHECK (package_type IN ('one_page', 'multi_page')),
  seo_addon BOOLEAN DEFAULT false,
  domain_setup_addon BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'form_completed', 'ai_questions', 'generating', 
    'preview_ready', 'editing', 'published'
  )),
  corrections_used INTEGER DEFAULT 0,
  corrections_limit INTEGER NOT NULL DEFAULT 10,
  generated_html TEXT,
  generated_css TEXT,
  generated_pages JSONB DEFAULT '[]',
  custom_domain TEXT,
  subdomain TEXT,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.website_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their website projects" ON public.website_projects;
CREATE POLICY "Users can manage their website projects"
ON public.website_projects
FOR ALL
USING (user_id = auth.uid());

-- Dane formularza WWW
CREATE TABLE IF NOT EXISTS public.website_form_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES website_projects(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  slogan TEXT,
  city_area TEXT,
  phone TEXT,
  email TEXT,
  working_hours TEXT,
  social_facebook TEXT,
  social_instagram TEXT,
  social_whatsapp TEXT,
  google_maps_link TEXT,
  about_short TEXT,
  why_us_points JSONB DEFAULT '[]',
  cta_type TEXT DEFAULT 'call' CHECK (cta_type IN ('call', 'form', 'whatsapp', 'all')),
  has_logo BOOLEAN DEFAULT false,
  logo_url TEXT,
  logo_description TEXT,
  generated_logo_url TEXT,
  ai_questions JSONB DEFAULT '[]',
  ai_answers JSONB DEFAULT '{}',
  tone_of_voice TEXT,
  visual_style TEXT,
  language TEXT DEFAULT 'pl',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.website_form_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their form data" ON public.website_form_data;
CREATE POLICY "Users can manage their form data"
ON public.website_form_data
FOR ALL
USING (
  project_id IN (SELECT id FROM website_projects WHERE user_id = auth.uid())
);

-- Usługi na stronie
CREATE TABLE IF NOT EXISTS public.website_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_data_id UUID REFERENCES website_form_data(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_from NUMERIC,
  description TEXT,
  inclusions JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0
);

ALTER TABLE public.website_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their website services" ON public.website_services;
CREATE POLICY "Users can manage their website services"
ON public.website_services
FOR ALL
USING (
  form_data_id IN (
    SELECT wfd.id FROM website_form_data wfd
    JOIN website_projects wp ON wfd.project_id = wp.id
    WHERE wp.user_id = auth.uid()
  )
);

-- Poprawki na stronie
CREATE TABLE IF NOT EXISTS public.website_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES website_projects(id) ON DELETE CASCADE,
  page_id TEXT,
  element_selector TEXT,
  element_description TEXT,
  short_note TEXT,
  full_description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'rejected')),
  ai_response TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.website_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their corrections" ON public.website_corrections;
CREATE POLICY "Users can manage their corrections"
ON public.website_corrections
FOR ALL
USING (
  project_id IN (SELECT id FROM website_projects WHERE user_id = auth.uid())
);

-- Ceny pakietów (Admin)
CREATE TABLE IF NOT EXISTS public.website_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type TEXT UNIQUE NOT NULL,
  base_price NUMERIC NOT NULL,
  corrections_included INTEGER NOT NULL,
  seo_addon_price NUMERIC DEFAULT 0,
  domain_setup_price NUMERIC DEFAULT 0,
  extra_corrections_price NUMERIC DEFAULT 0,
  generation_cost NUMERIC DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.website_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view pricing" ON public.website_pricing;
CREATE POLICY "Anyone can view pricing"
ON public.website_pricing
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage pricing" ON public.website_pricing;
CREATE POLICY "Admins can manage pricing"
ON public.website_pricing
FOR ALL
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Domyślne ceny
INSERT INTO public.website_pricing (package_type, base_price, corrections_included, seo_addon_price, domain_setup_price, extra_corrections_price, generation_cost)
VALUES 
  ('one_page', 299, 10, 99, 149, 15, 5),
  ('multi_page', 599, 20, 149, 149, 10, 5)
ON CONFLICT (package_type) DO NOTHING;

-- =====================================================
-- SEKCJA 2: ROZBUDOWA AI AGENTÓW
-- =====================================================

-- Typy agentów
CREATE TABLE IF NOT EXISTS public.ai_agent_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key TEXT UNIQUE NOT NULL,
  name_pl TEXT NOT NULL,
  description TEXT,
  base_prompt TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.ai_agent_types (type_key, name_pl, description) VALUES
  ('sales', 'Agent Sprzedaży', 'Obsługuje leady, prowadzi rozmowy sprzedażowe, zamyka transakcje'),
  ('reception', 'Agent Recepcji', 'Przyjmuje rezerwacje, udziela informacji, przekierowuje rozmowy'),
  ('confirmation', 'Agent Potwierdzania', 'Potwierdza wizyty, przypomina o terminach'),
  ('support', 'Agent Obsługi Klienta', 'Odpowiada na pytania, rozwiązuje problemy')
ON CONFLICT (type_key) DO NOTHING;

ALTER TABLE public.ai_agent_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view agent types" ON public.ai_agent_types;
CREATE POLICY "Anyone can view agent types"
ON public.ai_agent_types
FOR SELECT
USING (true);

-- Globalna baza wiedzy (uczenie między agentami)
CREATE TABLE IF NOT EXISTS public.ai_agent_global_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  pattern TEXT NOT NULL,
  success_rate NUMERIC,
  usage_count INTEGER DEFAULT 0,
  source_config_id UUID REFERENCES ai_agent_configs(id),
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_agent_global_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service providers can view approved knowledge" ON public.ai_agent_global_knowledge;
CREATE POLICY "Service providers can view approved knowledge"
ON public.ai_agent_global_knowledge
FOR SELECT
USING (is_approved = true OR source_config_id IN (
  SELECT id FROM ai_agent_configs WHERE user_id = auth.uid()
));

DROP POLICY IF EXISTS "Sales admins can manage knowledge" ON public.ai_agent_global_knowledge;
CREATE POLICY "Sales admins can manage knowledge"
ON public.ai_agent_global_knowledge
FOR ALL
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'sales_admin'))
);

-- Sesje rozmów AI (dla uczenia)
CREATE TABLE IF NOT EXISTS public.ai_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES ai_agent_configs(id),
  call_id UUID REFERENCES ai_agent_calls(id),
  lead_id UUID REFERENCES sales_leads(id),
  transcript JSONB,
  outcome TEXT,
  outcome_details JSONB,
  sentiment_scores JSONB,
  successful_patterns JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_agent_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their conversations" ON public.ai_agent_conversations;
CREATE POLICY "Users can view their conversations"
ON public.ai_agent_conversations
FOR SELECT
USING (
  config_id IN (SELECT id FROM ai_agent_configs WHERE user_id = auth.uid())
);

-- Ceny AI agentów (Admin)
CREATE TABLE IF NOT EXISTS public.ai_agent_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL,
  price_per_minute NUMERIC NOT NULL,
  price_per_booking NUMERIC,
  monthly_base_fee NUMERIC DEFAULT 0,
  free_minutes_per_month INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.ai_agent_pricing (agent_type, price_per_minute, price_per_booking, free_minutes_per_month) VALUES
  ('sales', 0.50, 5.00, 60),
  ('reception', 0.30, 2.00, 120),
  ('confirmation', 0.20, 0, 180),
  ('support', 0.40, 0, 90)
ON CONFLICT DO NOTHING;

ALTER TABLE public.ai_agent_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view AI pricing" ON public.ai_agent_pricing;
CREATE POLICY "Anyone can view AI pricing"
ON public.ai_agent_pricing
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage AI pricing" ON public.ai_agent_pricing;
CREATE POLICY "Admins can manage AI pricing"
ON public.ai_agent_pricing
FOR ALL
USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- =====================================================
-- FEATURE TOGGLES
-- =====================================================

INSERT INTO public.feature_toggles (feature_key, feature_name, category, is_enabled, description) VALUES
  ('website_builder_enabled', 'Kreator stron WWW', 'services', false, 'Moduł tworzenia stron WWW dla usługodawców'),
  ('website_builder_seo_addon', 'SEO Addon', 'services', true, 'Opcja SEO w kreatorze stron'),
  ('ai_agents_global_learning', 'AI Uczenie globalne', 'ai', false, 'Agregacja wiedzy między agentami'),
  ('ai_agents_free_tier', 'AI Agenci darmowy tier', 'ai', true, 'Darmowy dostęp do AI agentów (beta)')
ON CONFLICT (feature_key) DO NOTHING;

-- Dodaj kolumnę agent_type do ai_agent_configs jeśli nie istnieje
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ai_agent_configs' 
    AND column_name = 'agent_type'
  ) THEN
    ALTER TABLE public.ai_agent_configs ADD COLUMN agent_type TEXT DEFAULT 'sales';
  END IF;
END $$;
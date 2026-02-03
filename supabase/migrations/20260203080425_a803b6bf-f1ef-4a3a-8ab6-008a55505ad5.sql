-- =========================================
-- AI CALL AGENT - BUSINESS PROFILES, SCRIPTS, LEGAL CONSENTS
-- =========================================

-- 1. Profil firmy do rozmów AI
CREATE TABLE IF NOT EXISTS public.ai_call_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL UNIQUE,
  website_url TEXT,
  business_description TEXT,
  services_json JSONB DEFAULT '[]'::jsonb,
  faq_json JSONB DEFAULT '[]'::jsonb,
  rules_json JSONB DEFAULT '{}'::jsonb,
  pricing_notes TEXT,
  last_script_generation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Skrypty rozmów AI
CREATE TABLE IF NOT EXISTS public.ai_call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  language TEXT DEFAULT 'pl',
  voice_id TEXT,
  scenario_type TEXT DEFAULT 'lead_callback',
  style TEXT DEFAULT 'friendly',
  status TEXT DEFAULT 'draft_ai',
  title TEXT,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Zgody prawne AI Call
CREATE TABLE IF NOT EXISTS public.ai_call_legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1.0-2026-02-03',
  accepted BOOLEAN DEFAULT false,
  accepted_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela unmapped_drivers do śledzenia nierozpoznanych kierowców
CREATE TABLE IF NOT EXISTS public.unmapped_settlement_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE CASCADE,
  settlement_period_id UUID,
  full_name TEXT,
  uber_id TEXT,
  bolt_id TEXT,
  freenow_id TEXT,
  phone TEXT,
  linked_driver_id UUID REFERENCES public.drivers(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- RLS dla ai_call_business_profiles
ALTER TABLE public.ai_call_business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own profiles" ON public.ai_call_business_profiles;
CREATE POLICY "Users manage own profiles" ON public.ai_call_business_profiles
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Sales admins view all profiles" ON public.ai_call_business_profiles;
CREATE POLICY "Sales admins view all profiles" ON public.ai_call_business_profiles
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- RLS dla ai_call_scripts
ALTER TABLE public.ai_call_scripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own scripts" ON public.ai_call_scripts;
CREATE POLICY "Users manage own scripts" ON public.ai_call_scripts
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Sales admins view all scripts" ON public.ai_call_scripts;
CREATE POLICY "Sales admins view all scripts" ON public.ai_call_scripts
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- RLS dla ai_call_legal_consents
ALTER TABLE public.ai_call_legal_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own consents" ON public.ai_call_legal_consents;
CREATE POLICY "Users manage own consents" ON public.ai_call_legal_consents
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Sales admins view all consents" ON public.ai_call_legal_consents;
CREATE POLICY "Sales admins view all consents" ON public.ai_call_legal_consents
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- RLS dla unmapped_settlement_drivers - użyj user_roles zamiast owner_user_id
ALTER TABLE public.unmapped_settlement_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet managers manage unmapped drivers" ON public.unmapped_settlement_drivers;
CREATE POLICY "Fleet managers manage unmapped drivers" ON public.unmapped_settlement_drivers
  FOR ALL USING (
    fleet_id IN (SELECT fleet_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('fleet_settlement', 'fleet_rental'))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Trigger dla updated_at (jeśli nie istnieje)
CREATE OR REPLACE FUNCTION public.update_ai_call_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_ai_call_business_profiles_updated_at ON public.ai_call_business_profiles;
CREATE TRIGGER update_ai_call_business_profiles_updated_at
  BEFORE UPDATE ON public.ai_call_business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_call_profiles_updated_at();

DROP TRIGGER IF EXISTS update_ai_call_scripts_updated_at ON public.ai_call_scripts;
CREATE TRIGGER update_ai_call_scripts_updated_at
  BEFORE UPDATE ON public.ai_call_scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_call_profiles_updated_at();

-- Włącz global flag dla AI Call (dla testów)
UPDATE public.feature_toggles SET is_enabled = true WHERE feature_key = 'ai_call_enabled_global';

-- Dodaj indeksy
CREATE INDEX IF NOT EXISTS idx_ai_call_scripts_config_id ON public.ai_call_scripts(config_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_business_profiles_config_id ON public.ai_call_business_profiles(config_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_legal_consents_user_id ON public.ai_call_legal_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_unmapped_settlement_drivers_fleet_id ON public.unmapped_settlement_drivers(fleet_id);
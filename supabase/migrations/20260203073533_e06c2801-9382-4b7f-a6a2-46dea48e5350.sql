-- =============================================
-- AI CALL AGENT MODULE - DATABASE EXTENSION
-- =============================================

-- 1. WHITELIST TABLES

-- Whitelist firm po NIP
CREATE TABLE IF NOT EXISTS public.ai_call_company_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip TEXT NOT NULL UNIQUE,
  company_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  valid_from DATE,
  valid_to DATE,
  added_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Whitelist użytkowników po email
CREATE TABLE IF NOT EXISTS public.ai_call_user_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  valid_from DATE,
  valid_to DATE,
  added_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. AI CALL QUEUE TABLE
CREATE TABLE IF NOT EXISTS public.ai_call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE CASCADE NOT NULL,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. AI CALL AUDIT LOG
CREATE TABLE IF NOT EXISTS public.ai_call_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES auth.users(id),
  target_type TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. EXTEND ai_agent_configs
ALTER TABLE public.ai_agent_configs
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pl',
ADD COLUMN IF NOT EXISTS lead_sources JSONB DEFAULT '["manual"]'::jsonb,
ADD COLUMN IF NOT EXISTS calling_hours_start TIME DEFAULT '09:00',
ADD COLUMN IF NOT EXISTS calling_hours_end TIME DEFAULT '20:00',
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- 5. FEATURE FLAGS
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES 
  ('ai_call_enabled_global', 'AI Call - Global', 'Globalny przełącznik modułu AI Call', false, 'ai'),
  ('ai_call_recording_enabled', 'AI Call - Nagrywanie', 'Nagrywanie rozmów AI (domyślnie OFF)', false, 'ai'),
  ('ai_call_test_mode', 'AI Call - Tryb testowy', 'Tryb testowy dla kont demo', true, 'ai'),
  ('ai_call_meta_enabled', 'AI Call - Meta Leads', 'Import leadów z Meta/Facebook', false, 'ai'),
  ('ai_call_sheets_enabled', 'AI Call - Google Sheets', 'Import leadów z Google Sheets', false, 'ai'),
  ('ai_call_telegram_enabled', 'AI Call - Telegram', 'Import leadów z Telegram', false, 'ai')
ON CONFLICT (feature_key) DO NOTHING;

-- 6. RLS POLICIES

-- ai_call_company_whitelist
ALTER TABLE public.ai_call_company_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sales admins manage company whitelist" ON public.ai_call_company_whitelist;
CREATE POLICY "Sales admins manage company whitelist" ON public.ai_call_company_whitelist
  FOR ALL USING (public.is_sales_admin(auth.uid()));

-- ai_call_user_whitelist
ALTER TABLE public.ai_call_user_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sales admins manage user whitelist" ON public.ai_call_user_whitelist;
CREATE POLICY "Sales admins manage user whitelist" ON public.ai_call_user_whitelist
  FOR ALL USING (public.is_sales_admin(auth.uid()));

-- ai_call_queue
ALTER TABLE public.ai_call_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own queue" ON public.ai_call_queue;
CREATE POLICY "Users view own queue" ON public.ai_call_queue
  FOR SELECT USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users manage own queue" ON public.ai_call_queue;
CREATE POLICY "Users manage own queue" ON public.ai_call_queue
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Sales admins view all queue" ON public.ai_call_queue;
CREATE POLICY "Sales admins view all queue" ON public.ai_call_queue
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- ai_call_audit_log
ALTER TABLE public.ai_call_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sales admins view audit log" ON public.ai_call_audit_log;
CREATE POLICY "Sales admins view audit log" ON public.ai_call_audit_log
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

DROP POLICY IF EXISTS "System inserts audit log" ON public.ai_call_audit_log;
CREATE POLICY "System inserts audit log" ON public.ai_call_audit_log
  FOR INSERT WITH CHECK (true);

-- 7. TRIGGERS FOR updated_at
CREATE OR REPLACE FUNCTION public.update_ai_call_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS update_ai_call_company_whitelist_updated_at ON public.ai_call_company_whitelist;
CREATE TRIGGER update_ai_call_company_whitelist_updated_at
  BEFORE UPDATE ON public.ai_call_company_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_call_updated_at();

DROP TRIGGER IF EXISTS update_ai_call_user_whitelist_updated_at ON public.ai_call_user_whitelist;
CREATE TRIGGER update_ai_call_user_whitelist_updated_at
  BEFORE UPDATE ON public.ai_call_user_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_call_updated_at();

DROP TRIGGER IF EXISTS update_ai_call_queue_updated_at ON public.ai_call_queue;
CREATE TRIGGER update_ai_call_queue_updated_at
  BEFORE UPDATE ON public.ai_call_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_call_updated_at();

-- 8. SEED TEST DATA - Whitelist
INSERT INTO public.ai_call_user_whitelist (email, status, notes)
VALUES 
  ('warsztat@test.pl', 'active', 'Konto testowe MVP'),
  ('detaling@test.pl', 'active', 'Konto testowe MVP'),
  ('anastasiia.shapovalova1991@gmail.com', 'active', 'Tester'),
  ('majewskitest@test.pl', 'active', 'Tester'),
  ('daniel.moshechkov@gmail.com', 'active', 'Sales Admin')
ON CONFLICT (email) DO NOTHING;

-- 9. INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_status ON public.ai_call_queue(status);
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_config_id ON public.ai_call_queue(config_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_queue_scheduled_at ON public.ai_call_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_user_whitelist_email ON public.ai_call_user_whitelist(email);
CREATE INDEX IF NOT EXISTS idx_ai_call_company_whitelist_nip ON public.ai_call_company_whitelist(nip);
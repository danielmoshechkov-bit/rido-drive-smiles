
-- ============================================
-- GetRido AI Hub + Engine + Roadmap (MVP)
-- ============================================

-- 1) AI Providers configuration
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE, -- 'openai', 'gemini', 'kimi', 'lovable'
  display_name text NOT NULL,
  is_enabled boolean DEFAULT false,
  api_key_encrypted text,
  default_model text,
  timeout_seconds integer DEFAULT 30,
  daily_limit integer,
  admin_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins manage ai_providers" ON public.ai_providers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) AI Routing rules
CREATE TABLE IF NOT EXISTS public.ai_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL UNIQUE, -- 'text', 'image', 'ocr', 'search', 'embeddings'
  primary_provider_key text REFERENCES public.ai_providers(provider_key),
  secondary_provider_key text REFERENCES public.ai_providers(provider_key),
  tertiary_provider_key text REFERENCES public.ai_providers(provider_key),
  allow_fallback boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins manage ai_routing_rules" ON public.ai_routing_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) AI Limits configuration
CREATE TABLE IF NOT EXISTS public.ai_limits_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global', -- 'global', 'tenant', 'user'
  scope_id text, -- null for global, entity_id for tenant, user_id for user
  max_requests_per_day integer,
  max_tokens_per_day integer,
  max_documents_per_day integer,
  max_images_per_day integer,
  budget_pln_per_month numeric,
  enforcement_mode text DEFAULT 'block', -- 'block' or 'warn'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(scope, scope_id)
);
ALTER TABLE public.ai_limits_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins manage ai_limits_config" ON public.ai_limits_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) AI Requests Log (central audit)
CREATE TABLE IF NOT EXISTS public.ai_requests_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  actor_user_id uuid,
  tenant_id uuid, -- entity_id
  feature text NOT NULL, -- 'ai_search', 'ai_help', 'ai_ocr', 'ai_image', 'ai_description', 'ai_invoice', 'ai_agent', 'ai_tools'
  provider text, -- 'openai', 'gemini', 'kimi', 'lovable'
  model text,
  task_type text, -- 'text', 'image', 'ocr', 'search'
  mode text DEFAULT 'fast', -- 'fast', 'accurate', 'action'
  status text DEFAULT 'pending', -- 'pending', 'success', 'failed'
  tokens_in integer,
  tokens_out integer,
  cost_estimate numeric,
  response_time_ms integer,
  input_snapshot jsonb,
  output_snapshot jsonb,
  error_message text,
  cache_hit boolean DEFAULT false
);
ALTER TABLE public.ai_requests_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view ai_requests_log" ON public.ai_requests_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert ai_requests_log" ON public.ai_requests_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Index for fast queries
CREATE INDEX idx_ai_requests_log_created ON public.ai_requests_log(created_at DESC);
CREATE INDEX idx_ai_requests_log_feature ON public.ai_requests_log(feature);
CREATE INDEX idx_ai_requests_log_actor ON public.ai_requests_log(actor_user_id);

-- 5) AI Tenant Context
CREATE TABLE IF NOT EXISTS public.ai_tenant_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL UNIQUE,
  business_description text,
  industry text,
  pricing_notes text,
  preferences jsonb DEFAULT '{}',
  language text DEFAULT 'pl',
  website_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_tenant_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and entity owners can manage ai_tenant_context" ON public.ai_tenant_context
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_entity_owner(entity_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_entity_owner(entity_id));

-- 6) AI User Context
CREATE TABLE IF NOT EXISTS public.ai_user_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  preferred_language text DEFAULT 'pl',
  response_style text DEFAULT 'balanced', -- 'concise', 'balanced', 'detailed'
  shortcuts jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_user_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ai_user_context" ON public.ai_user_context
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7) AI Feature Flags (dedicated for AI engine)
CREATE TABLE IF NOT EXISTS public.ai_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  flag_name text NOT NULL,
  description text,
  is_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ai_feature_flags" ON public.ai_feature_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can read ai_feature_flags" ON public.ai_feature_flags
  FOR SELECT TO authenticated
  USING (true);

-- Seed default AI feature flags
INSERT INTO public.ai_feature_flags (flag_key, flag_name, description, is_enabled) VALUES
  ('ai_hub_enabled', 'AI Hub', 'Centralny panel zarządzania AI', true),
  ('ai_engine_enabled', 'AI Engine', 'Centralny silnik GetRido AI', true),
  ('ai_text_enabled', 'AI Tekst', 'Funkcje tekstowe AI (opisy, czat, pomoc)', true),
  ('ai_image_enabled', 'AI Obraz', 'Edycja i generowanie obrazów AI', true),
  ('ai_ocr_enabled', 'AI OCR', 'Rozpoznawanie dokumentów i faktur', false),
  ('ai_search_enabled', 'AI Wyszukiwarka', 'Inteligentne wyszukiwanie AI', true),
  ('ai_agents_enabled', 'AI Agenci', 'Agenci sprzedaży i obsługi', false),
  ('ai_lovable_pages_enabled', 'AI Strony', 'Generowanie stron WWW', false),
  ('ai_rag_enabled', 'AI RAG', 'Wyszukiwanie w danych portalu', false),
  ('ai_tools_enabled', 'AI Narzędzia', 'Akcje i narzędzia AI', false),
  ('ai_planner_enabled', 'AI Planner', 'Inteligentny planer zadań', false)
ON CONFLICT (flag_key) DO NOTHING;

-- 8) AI Response Cache
CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE, -- hash of tenant_id + feature + query + mode
  tenant_id uuid,
  feature text NOT NULL,
  query_hash text NOT NULL,
  mode text DEFAULT 'fast',
  response_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages ai_response_cache" ON public.ai_response_cache
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE INDEX idx_ai_cache_key ON public.ai_response_cache(cache_key);
CREATE INDEX idx_ai_cache_expires ON public.ai_response_cache(expires_at);

-- 9) AI Feedback Events (for learning)
CREATE TABLE IF NOT EXISTS public.ai_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid,
  entity_id uuid,
  feature text NOT NULL,
  request_log_id uuid REFERENCES public.ai_requests_log(id),
  rating text, -- 'good', 'bad', 'neutral'
  error_type text, -- 'wrong_answer', 'wrong_offer', 'misunderstood', 'other'
  corrected_version text,
  conversion_result text, -- 'sale', 'booking', 'no_action'
  metadata jsonb DEFAULT '{}'
);
ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can submit own feedback" ON public.ai_feedback_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all feedback" ON public.ai_feedback_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 10) AI Quality Metrics
CREATE TABLE IF NOT EXISTS public.ai_quality_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  feature text NOT NULL,
  entity_id uuid,
  total_requests integer DEFAULT 0,
  successful_requests integer DEFAULT 0,
  avg_response_time_ms integer,
  conversion_rate numeric,
  correction_rate numeric,
  thumbs_up integer DEFAULT 0,
  thumbs_down integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(period_start, feature, entity_id)
);
ALTER TABLE public.ai_quality_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage ai_quality_metrics" ON public.ai_quality_metrics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 11) AI Learning Consent
CREATE TABLE IF NOT EXISTS public.ai_learning_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid UNIQUE,
  consent_given boolean DEFAULT false,
  consented_at timestamptz,
  consented_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_learning_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Entity owners manage ai_learning_consent" ON public.ai_learning_consent
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_entity_owner(entity_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_entity_owner(entity_id));

-- 12) Admin Roadmap Tasks
CREATE TABLE IF NOT EXISTS public.admin_roadmap_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority text DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status text DEFAULT 'idea', -- 'idea', 'todo', 'in_progress', 'testing', 'done', 'on_hold'
  module text, -- 'AI', 'OCR', 'Kalendarz', 'Marketplace', 'Flota', 'Faktury'
  assigned_to uuid,
  deadline date,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.admin_roadmap_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and sales_admin manage roadmap" ON public.admin_roadmap_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_admin'));

-- 13) Admin Roadmap Comments
CREATE TABLE IF NOT EXISTS public.admin_roadmap_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.admin_roadmap_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.admin_roadmap_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and sales_admin manage roadmap comments" ON public.admin_roadmap_comments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_admin'));

-- Seed default AI providers
INSERT INTO public.ai_providers (provider_key, display_name, is_enabled, default_model) VALUES
  ('lovable', 'Lovable AI Gateway', true, 'google/gemini-3-flash-preview'),
  ('openai', 'OpenAI', false, 'gpt-4o'),
  ('gemini', 'Google Gemini', false, 'gemini-2.0-flash'),
  ('kimi', 'Kimi AI', false, null)
ON CONFLICT (provider_key) DO NOTHING;

-- Seed default routing rules
INSERT INTO public.ai_routing_rules (task_type, primary_provider_key) VALUES
  ('text', 'lovable'),
  ('image', 'lovable'),
  ('ocr', 'lovable'),
  ('search', 'lovable'),
  ('embeddings', 'lovable')
ON CONFLICT (task_type) DO NOTHING;

-- Seed default global limits
INSERT INTO public.ai_limits_config (scope, scope_id, max_requests_per_day, max_tokens_per_day, enforcement_mode) VALUES
  ('global', null, 10000, 5000000, 'warn')
ON CONFLICT (scope, scope_id) DO NOTHING;

-- Triggers for updated_at
CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_ai_routing_rules_updated_at BEFORE UPDATE ON public.ai_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_ai_limits_config_updated_at BEFORE UPDATE ON public.ai_limits_config
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_ai_tenant_context_updated_at BEFORE UPDATE ON public.ai_tenant_context
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_ai_user_context_updated_at BEFORE UPDATE ON public.ai_user_context
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_ai_feature_flags_updated_at BEFORE UPDATE ON public.ai_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_ai_learning_consent_updated_at BEFORE UPDATE ON public.ai_learning_consent
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER update_admin_roadmap_tasks_updated_at BEFORE UPDATE ON public.admin_roadmap_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

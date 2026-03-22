
-- ═══════════════════════════════════════
-- AI SALES AGENTS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_sales_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Agent Sprzedażowy',
  status TEXT DEFAULT 'inactive' CHECK (status IN ('inactive','active','paused','learning')),
  company_profile JSONB DEFAULT '{}'::jsonb,
  contact_channels TEXT[] DEFAULT ARRAY['sms'],
  first_contact_delay_minutes INT DEFAULT 2,
  follow_up_sequence JSONB DEFAULT '[]'::jsonb,
  meta_access_token TEXT,
  meta_ad_account_id TEXT,
  meta_page_id TEXT,
  meta_form_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  calendar_provider TEXT CHECK (calendar_provider IN ('google','calendly','custom')),
  calendar_token TEXT,
  calendar_id TEXT,
  available_slots_config JSONB DEFAULT '{}'::jsonb,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_phone_number TEXT,
  vapi_api_key TEXT,
  agent_voice_id TEXT,
  agent_phone_script TEXT,
  total_leads INT DEFAULT 0,
  total_contacted INT DEFAULT 0,
  total_meetings_booked INT DEFAULT 0,
  total_conversions INT DEFAULT 0,
  conversion_rate NUMERIC(5,2) DEFAULT 0,
  avg_response_time_minutes NUMERIC(8,2) DEFAULT 0,
  learned_objections JSONB DEFAULT '[]'::jsonb,
  learned_phrases JSONB DEFAULT '[]'::jsonb,
  last_learning_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════
-- AI SALES LEADS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_sales_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  agent_id UUID REFERENCES public.ai_sales_agents(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id),
  user_id UUID REFERENCES auth.users(id),
  meta_lead_id TEXT UNIQUE,
  meta_form_id TEXT,
  meta_ad_id TEXT,
  meta_campaign_id TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new','contacted','in_conversation','meeting_booked',
    'converted','rejected','no_answer','opted_out'
  )),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('hot','warm','normal','cold')),
  ai_lead_score INT DEFAULT 50,
  ai_intent_analysis TEXT,
  ai_recommended_approach TEXT,
  meeting_scheduled_at TIMESTAMPTZ,
  meeting_calendar_event_id TEXT,
  meeting_type TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  last_contact_at TIMESTAMPTZ,
  next_contact_at TIMESTAMPTZ,
  contact_attempts INT DEFAULT 0
);

-- ═══════════════════════════════════════
-- AI SALES CONVERSATIONS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_sales_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  lead_id UUID REFERENCES public.ai_sales_leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.ai_sales_agents(id),
  channel TEXT CHECK (channel IN ('sms','call','whatsapp','email')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','failed')),
  direction TEXT CHECK (direction IN ('outbound','inbound')),
  messages JSONB DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  ai_sentiment TEXT CHECK (ai_sentiment IN ('positive','neutral','negative')),
  ai_objections_detected TEXT[],
  ai_buying_signals TEXT[],
  ai_outcome TEXT,
  ai_learning_notes TEXT,
  call_duration_seconds INT,
  call_recording_url TEXT,
  call_transcript TEXT,
  twilio_conversation_sid TEXT
);

-- ═══════════════════════════════════════
-- AI AGENT QUESTIONNAIRE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_sales_questionnaire (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  agent_id UUID REFERENCES public.ai_sales_agents(id) ON DELETE CASCADE UNIQUE,
  is_complete BOOLEAN DEFAULT false,
  completion_percentage INT DEFAULT 0,
  q_company_name TEXT,
  q_company_description TEXT,
  q_years_in_business TEXT,
  q_team_size TEXT,
  q_location TEXT,
  q_service_area TEXT,
  q_company_achievements TEXT,
  q_certifications TEXT,
  q_service_name TEXT,
  q_service_description TEXT,
  q_service_duration TEXT,
  q_service_process TEXT,
  q_service_unique_value TEXT,
  q_service_results TEXT,
  q_service_guarantee TEXT,
  q_service_case_studies TEXT,
  q_price_from NUMERIC,
  q_price_to NUMERIC,
  q_price_model TEXT,
  q_payment_methods TEXT,
  q_payment_terms TEXT,
  q_price_justification TEXT,
  q_promotions TEXT,
  q_target_customer_profile TEXT,
  q_customer_problems TEXT,
  q_customer_transformation TEXT,
  q_customer_fears TEXT,
  q_wrong_customer TEXT,
  q_objection_price TEXT,
  q_objection_time TEXT,
  q_objection_think TEXT,
  q_objection_competitor TEXT,
  q_objection_diy TEXT,
  q_objection_trust TEXT,
  q_objection_custom_1 TEXT,
  q_objection_custom_1_answer TEXT,
  q_objection_custom_2 TEXT,
  q_objection_custom_2_answer TEXT,
  q_sales_tone TEXT CHECK (q_sales_tone IN ('formal','semiformal','casual')),
  q_preferred_contact_time TEXT,
  q_meeting_types TEXT,
  q_typical_sales_cycle TEXT,
  q_closing_technique TEXT,
  q_special_instructions TEXT
);

-- ═══════════════════════════════════════
-- AI AGENT KNOWLEDGE BASE
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_sales_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  agent_id UUID REFERENCES public.ai_sales_agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  knowledge_type TEXT CHECK (knowledge_type IN (
    'successful_objection_handling',
    'effective_opener',
    'closing_phrase',
    'failed_approach',
    'customer_insight',
    'timing_insight'
  )),
  content TEXT NOT NULL,
  context TEXT,
  success_rate NUMERIC(5,2),
  usage_count INT DEFAULT 1,
  source_conversation_id UUID REFERENCES public.ai_sales_conversations(id),
  is_shared BOOLEAN DEFAULT false,
  industry TEXT
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_agent ON ai_sales_leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_sales_leads_status ON ai_sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_ai_sales_conversations_lead ON ai_sales_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_sales_knowledge_agent ON ai_sales_knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_sales_knowledge_type ON ai_sales_knowledge(knowledge_type);

-- RLS
ALTER TABLE public.ai_sales_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sales_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sales_questionnaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sales_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agents" ON public.ai_sales_agents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own leads" ON public.ai_sales_leads FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users see own conversations" ON public.ai_sales_conversations FOR ALL USING (agent_id IN (SELECT id FROM public.ai_sales_agents WHERE user_id = auth.uid()));
CREATE POLICY "Users see own questionnaire" ON public.ai_sales_questionnaire FOR ALL USING (agent_id IN (SELECT id FROM public.ai_sales_agents WHERE user_id = auth.uid()));
CREATE POLICY "Users see own knowledge" ON public.ai_sales_knowledge FOR ALL USING (user_id = auth.uid() OR is_shared = true);

CREATE POLICY "Admin full access agents" ON public.ai_sales_agents FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin full access leads" ON public.ai_sales_leads FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin full access conversations" ON public.ai_sales_conversations FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin full access questionnaire" ON public.ai_sales_questionnaire FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin full access knowledge" ON public.ai_sales_knowledge FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_ai_sales_agents_updated_at
  BEFORE UPDATE ON public.ai_sales_agents
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

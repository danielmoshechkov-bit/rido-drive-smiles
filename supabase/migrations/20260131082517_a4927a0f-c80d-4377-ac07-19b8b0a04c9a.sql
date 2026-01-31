-- AI Agent Configuration per user/company
CREATE TABLE public.ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Company info (onboarding)
  company_name TEXT NOT NULL,
  company_description TEXT,
  services JSONB DEFAULT '[]'::jsonb,
  working_hours JSONB DEFAULT '{"mon": {"start": "09:00", "end": "18:00"}, "tue": {"start": "09:00", "end": "18:00"}, "wed": {"start": "09:00", "end": "18:00"}, "thu": {"start": "09:00", "end": "18:00"}, "fri": {"start": "09:00", "end": "18:00"}}'::jsonb,
  service_area TEXT,
  faq JSONB DEFAULT '[]'::jsonb,
  booking_rules JSONB DEFAULT '{}'::jsonb,
  -- Voice settings
  voice_id TEXT DEFAULT 'JBFqnCBsd6RMkjVDRZzb',
  voice_gender TEXT DEFAULT 'male',
  conversation_style TEXT DEFAULT 'professional',
  -- Limits
  max_calls_per_day INTEGER DEFAULT 20,
  max_minutes_per_month INTEGER DEFAULT 120,
  max_retries_per_lead INTEGER DEFAULT 3,
  -- Status
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI Agent Calls Log
CREATE TABLE public.ai_agent_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  -- Call status
  call_status TEXT DEFAULT 'pending',
  call_sid TEXT,
  -- Metrics
  duration_seconds INTEGER,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  -- Outcome
  outcome TEXT,
  booking_slot_id UUID,
  -- Transcript and analysis
  transcript TEXT,
  ai_summary TEXT,
  sentiment TEXT,
  -- Costs
  cost_minutes NUMERIC(10,2) DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI Agent Calendar Slots
CREATE TABLE public.ai_agent_calendar_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  -- Slot
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  -- Status
  status TEXT DEFAULT 'available',
  -- Booking
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  call_id UUID REFERENCES public.ai_agent_calls(id) ON DELETE SET NULL,
  booking_notes TEXT,
  -- Confirmation
  confirmed_at TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI Agent Usage tracking
CREATE TABLE public.ai_agent_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE NOT NULL,
  month DATE NOT NULL,
  calls_count INTEGER DEFAULT 0,
  minutes_used NUMERIC(10,2) DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  bookings_count INTEGER DEFAULT 0,
  is_limit_reached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(config_id, month)
);

-- Extend sales_leads with AI consent fields
ALTER TABLE public.sales_leads 
ADD COLUMN IF NOT EXISTS ai_consent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_preferred_time TEXT,
ADD COLUMN IF NOT EXISTS ai_call_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ai_last_call_at TIMESTAMPTZ;

-- Add feature flag for AI Sales Agent
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES ('ai_sales_agent_enabled', 'AI Agent Sprzedaży', 'Automatyczne połączenia AI do leadów', false, 'sales')
ON CONFLICT (feature_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_calendar_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_agent_configs
CREATE POLICY "Users can view own config" ON public.ai_agent_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own config" ON public.ai_agent_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own config" ON public.ai_agent_configs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Sales admins can view all configs" ON public.ai_agent_configs
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- RLS Policies for ai_agent_calls
CREATE POLICY "Users can view own calls" ON public.ai_agent_calls
  FOR SELECT USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create own calls" ON public.ai_agent_calls
  FOR INSERT WITH CHECK (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Sales admins can view all calls" ON public.ai_agent_calls
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- RLS Policies for ai_agent_calendar_slots
CREATE POLICY "Users can view own slots" ON public.ai_agent_calendar_slots
  FOR SELECT USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage own slots" ON public.ai_agent_calendar_slots
  FOR ALL USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Sales admins can view all slots" ON public.ai_agent_calendar_slots
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- RLS Policies for ai_agent_usage
CREATE POLICY "Users can view own usage" ON public.ai_agent_usage
  FOR SELECT USING (
    config_id IN (SELECT id FROM public.ai_agent_configs WHERE user_id = auth.uid())
  );

CREATE POLICY "Sales admins can view all usage" ON public.ai_agent_usage
  FOR SELECT USING (public.is_sales_admin(auth.uid()));

-- Trigger for updated_at on ai_agent_configs
CREATE TRIGGER update_ai_agent_configs_updated_at
  BEFORE UPDATE ON public.ai_agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Trigger for updated_at on ai_agent_usage
CREATE TRIGGER update_ai_agent_usage_updated_at
  BEFORE UPDATE ON public.ai_agent_usage
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
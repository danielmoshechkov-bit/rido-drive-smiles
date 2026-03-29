
-- =============================================
-- CZĘŚĆ 1: Rozszerzenie agency_clients
-- =============================================
ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS nip TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
  ADD COLUMN IF NOT EXISTS google_ad_account_id TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS instagram_account_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_access_token TEXT,
  ADD COLUMN IF NOT EXISTS portal_user_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_leads INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent NUMERIC DEFAULT 0;

-- =============================================
-- CZĘŚĆ 2: Raporty klientów
-- =============================================
CREATE TABLE IF NOT EXISTS client_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  agency_id UUID,
  created_by UUID,
  title TEXT,
  period_from DATE,
  period_to DATE,
  summary TEXT,
  campaigns_data JSONB,
  leads_count INT DEFAULT 0,
  meetings_count INT DEFAULT 0,
  spent NUMERIC DEFAULT 0,
  roas NUMERIC,
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage reports" ON client_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- CZĘŚĆ 3: Google My Business w service_providers
-- =============================================
ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS gmb_location_id TEXT,
  ADD COLUMN IF NOT EXISTS gmb_access_token TEXT,
  ADD COLUMN IF NOT EXISTS gmb_auto_posts BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmb_auto_reply_reviews BOOLEAN DEFAULT false;

-- =============================================
-- CZĘŚĆ 4: Follow-up sequences
-- =============================================
CREATE TABLE IF NOT EXISTS followup_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  steps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE followup_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider manages own sequences" ON followup_sequences FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  step_index INT,
  channel TEXT,
  message TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE followup_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated access followup queue" ON followup_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- CZĘŚĆ 5: Lead scoring
-- =============================================
ALTER TABLE service_leads
  ADD COLUMN IF NOT EXISTS ai_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_score_reason TEXT,
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC;

-- =============================================
-- CZĘŚĆ 6: AI Learning Core
-- =============================================
CREATE TABLE IF NOT EXISTS ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  lead_id UUID,
  interaction_type TEXT,
  channel TEXT,
  direction TEXT,
  message_sent TEXT,
  message_received TEXT,
  ai_generated BOOLEAN DEFAULT true,
  template_id UUID,
  outcome TEXT,
  outcome_value NUMERIC DEFAULT 0,
  response_time_minutes INT,
  sentiment_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ai_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider own interactions" ON ai_interactions FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS ai_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID,
  provider_id UUID REFERENCES service_providers(id) ON DELETE SET NULL,
  industry TEXT,
  use_case TEXT,
  channel TEXT,
  subject TEXT,
  body TEXT,
  variables JSONB DEFAULT '[]',
  times_used INT DEFAULT 0,
  times_responded INT DEFAULT 0,
  meetings_booked INT DEFAULT 0,
  sales_won INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ai_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public templates readable" ON ai_message_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Provider manages own templates" ON ai_message_templates FOR INSERT TO authenticated WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Provider updates own templates" ON ai_message_templates FOR UPDATE TO authenticated USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));
CREATE POLICY "Provider deletes own templates" ON ai_message_templates FOR DELETE TO authenticated USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS ai_lead_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry TEXT,
  city TEXT,
  source TEXT,
  avg_response_time_hours NUMERIC,
  avg_messages_to_convert INT,
  best_contact_hour INT,
  best_contact_day INT,
  common_objections JSONB DEFAULT '[]',
  winning_responses JSONB DEFAULT '[]',
  sample_size INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ai_lead_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read patterns" ON ai_lead_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write patterns" ON ai_lead_patterns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  lead_id UUID,
  phone_number TEXT,
  duration_seconds INT,
  transcript TEXT,
  ai_summary TEXT,
  ai_sentiment TEXT,
  ai_next_action TEXT,
  outcome TEXT,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Provider own calls" ON call_transcripts FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- =============================================
-- CZĘŚĆ 7: Daily Sales Intelligence
-- =============================================
CREATE TABLE IF NOT EXISTS daily_sales_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE,
  raw_data JSONB,
  claude_analysis JSONB,
  gpt_analysis JSONB,
  gemini_analysis JSONB,
  consensus JSONB,
  actions_taken JSONB DEFAULT '[]',
  results_next_day JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE daily_sales_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read daily reports" ON daily_sales_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- CZĘŚĆ 8: A/B Tests
-- =============================================
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  hypothesis TEXT,
  variant_a JSONB,
  variant_b JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  winner TEXT,
  results JSONB,
  suggested_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage ab tests" ON ab_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- CZĘŚĆ 9: Weekly Learning Reports
-- =============================================
CREATE TABLE IF NOT EXISTS weekly_learning_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE,
  raw_data JSONB,
  claude_analysis JSONB,
  gpt_analysis JSONB,
  gemini_analysis JSONB,
  consensus JSONB,
  actions_applied JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE weekly_learning_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read weekly reports" ON weekly_learning_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

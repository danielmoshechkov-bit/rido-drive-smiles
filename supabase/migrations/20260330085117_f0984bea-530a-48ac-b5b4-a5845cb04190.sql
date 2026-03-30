
-- Tabela akcji agenta (feedback loop)
CREATE TABLE IF NOT EXISTS agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  description text NOT NULL,
  campaign_id uuid REFERENCES agency_campaigns(id) ON DELETE SET NULL,
  proposed_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  executed_at timestamptz,
  outcome_roas_before numeric,
  outcome_roas_after numeric,
  outcome_measured_at timestamptz,
  status text DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','executed','measured'))
);

ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access agent_actions" ON agent_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Baza wiedzy platformy
CREATE TABLE IF NOT EXISTS platform_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('meta','google','both','industry')),
  category text NOT NULL CHECK (category IN (
    'algorithm_change','new_feature','policy_change','best_practice',
    'benchmark','creative_trend','audience_insight','cost_trend'
  )),
  title text NOT NULL,
  summary text NOT NULL,
  full_content text,
  source_url text,
  source_name text,
  published_at date,
  discovered_at timestamptz DEFAULT now(),
  relevance_score integer DEFAULT 5 CHECK (relevance_score BETWEEN 1 AND 10),
  is_active boolean DEFAULT true,
  applied_to_agent boolean DEFAULT false,
  tags text[]
);

ALTER TABLE platform_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access platform_knowledge" ON platform_knowledge FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_knowledge_platform_date ON platform_knowledge(platform, published_at DESC);
CREATE INDEX idx_knowledge_active ON platform_knowledge(is_active, relevance_score DESC);

-- Historia uruchomień bota wiedzy
CREATE TABLE IF NOT EXISTS knowledge_bot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  items_found integer DEFAULT 0,
  items_added integer DEFAULT 0,
  error_message text,
  sources_checked text[]
);

ALTER TABLE knowledge_bot_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access knowledge_bot_runs" ON knowledge_bot_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Snapshoty kampanii (dane historyczne co godzinę)
CREATE TABLE IF NOT EXISTS campaign_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES agency_campaigns(id) ON DELETE CASCADE,
  snapshot_at timestamptz DEFAULT now(),
  roas numeric,
  spend numeric,
  revenue numeric,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  impressions integer,
  clicks integer,
  conversions integer
);

ALTER TABLE campaign_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access campaign_snapshots" ON campaign_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Leady z AI scoring
CREATE TABLE IF NOT EXISTS marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  city text,
  company text,
  message text,
  source_platform text,
  source_campaign_id uuid REFERENCES agency_campaigns(id) ON DELETE SET NULL,
  client_id uuid REFERENCES agency_clients(id) ON DELETE SET NULL,
  ai_score integer CHECK (ai_score BETWEEN 1 AND 100),
  ai_priority text CHECK (ai_priority IN ('hot','warm','cold')),
  ai_recommendation text,
  follow_up_timing text,
  ai_reasoning text,
  status text DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','lost')),
  converted boolean DEFAULT false,
  contacted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access marketing_leads" ON marketing_leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Local SEO posty
CREATE TABLE IF NOT EXISTS local_seo_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES agency_clients(id) ON DELETE CASCADE,
  platform text CHECK (platform IN ('google_business','facebook_page','instagram')),
  post_text text NOT NULL,
  call_to_action text,
  topic text,
  image_url text,
  image_prompt text,
  status text DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','scheduled','published','rejected')),
  scheduled_for timestamptz,
  published_at timestamptz,
  google_post_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE local_seo_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access local_seo_posts" ON local_seo_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Dodatkowe kolumny do agency_campaigns (predykcje)
ALTER TABLE agency_campaigns
  ADD COLUMN IF NOT EXISTS predicted_roas_7d numeric,
  ADD COLUMN IF NOT EXISTS trend text,
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS ai_recommendation text,
  ADD COLUMN IF NOT EXISTS prediction_confidence integer,
  ADD COLUMN IF NOT EXISTS prediction_updated_at timestamptz;

-- Dodatkowe kolumny do agency_clients (local SEO)
ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS local_seo_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_approve_seo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS google_business_id text,
  ADD COLUMN IF NOT EXISTS recent_post_topics text[];

-- Warianty reklam
CREATE TABLE IF NOT EXISTS ad_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES agency_campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES agency_clients(id) ON DELETE SET NULL,
  headline text,
  body_text text,
  description text,
  cta text,
  image_url text,
  platform text,
  ctr numeric DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','pending_approval','rejected')),
  paused_reason text,
  generated_by text DEFAULT 'manual',
  generation_rationale text,
  rotation_enabled boolean DEFAULT false,
  auto_approve_rotation boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ad_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access ad_variants" ON ad_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

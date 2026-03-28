-- CRM Nieruchomości tables
CREATE TABLE IF NOT EXISTS agent_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES real_estate_agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  description_en TEXT,
  description_de TEXT,
  property_type TEXT NOT NULL DEFAULT 'mieszkanie',
  transaction_type TEXT NOT NULL DEFAULT 'sprzedaz',
  status TEXT NOT NULL DEFAULT 'aktualna',
  price NUMERIC(12,2),
  price_per_m2 NUMERIC(10,2),
  area_total NUMERIC(8,2),
  area_usable NUMERIC(8,2),
  area_plot NUMERIC(10,2),
  rooms_count INTEGER DEFAULT 0,
  rooms_data JSONB DEFAULT '[]'::jsonb,
  floor INTEGER,
  floors_total INTEGER,
  year_built INTEGER,
  condition TEXT,
  heating TEXT,
  ownership_form TEXT,
  address JSONB DEFAULT '{}'::jsonb,
  export_address JSONB,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  photos JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  exported_to JSONB DEFAULT '{}'::jsonb,
  has_balcony BOOLEAN DEFAULT false,
  has_elevator BOOLEAN DEFAULT false,
  has_parking BOOLEAN DEFAULT false,
  has_garden BOOLEAN DEFAULT false,
  ai_description_generated BOOLEAN DEFAULT false,
  ai_valuation JSONB,
  publish_on_getrido BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES real_estate_agents(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT DEFAULT '',
  email TEXT,
  phone TEXT,
  company TEXT,
  nip TEXT,
  client_type TEXT DEFAULT 'kupujacy',
  status TEXT DEFAULT 'aktywny',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES real_estate_agents(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES agent_contacts(id) ON DELETE SET NULL,
  listing_type TEXT,
  transaction_type TEXT,
  locations JSONB DEFAULT '[]'::jsonb,
  budget_min NUMERIC(12,2),
  budget_max NUMERIC(12,2),
  area_min NUMERIC(8,2),
  area_max NUMERIC(8,2),
  rooms_min INTEGER,
  rooms_max INTEGER,
  requirements JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES real_estate_agents(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES agent_contacts(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES agent_listings(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL DEFAULT 'notatka',
  title TEXT,
  notes TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES real_estate_agents(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES agent_contacts(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES agent_listings(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'nowy_kontakt',
  value NUMERIC(12,2),
  commission NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE agent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_deals ENABLE ROW LEVEL SECURITY;

-- Policies - agents can manage their own data
CREATE POLICY "Agents manage own listings" ON agent_listings FOR ALL USING (
  agent_id IN (SELECT id FROM real_estate_agents WHERE user_id = auth.uid())
);
CREATE POLICY "Agents manage own contacts" ON agent_contacts FOR ALL USING (
  agent_id IN (SELECT id FROM real_estate_agents WHERE user_id = auth.uid())
);
CREATE POLICY "Agents manage own searches" ON agent_searches FOR ALL USING (
  agent_id IN (SELECT id FROM real_estate_agents WHERE user_id = auth.uid())
);
CREATE POLICY "Agents manage own activities" ON agent_activities FOR ALL USING (
  agent_id IN (SELECT id FROM real_estate_agents WHERE user_id = auth.uid())
);
CREATE POLICY "Agents manage own deals" ON agent_deals FOR ALL USING (
  agent_id IN (SELECT id FROM real_estate_agents WHERE user_id = auth.uid())
);

-- Admin full access
CREATE POLICY "Admin full access listings" ON agent_listings FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Admin full access contacts" ON agent_contacts FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Admin full access searches" ON agent_searches FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Admin full access activities" ON agent_activities FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Admin full access deals" ON agent_deals FOR ALL USING (
  public.has_role(auth.uid(), 'admin')
);

-- Indexes
CREATE INDEX idx_agent_listings_agent ON agent_listings(agent_id);
CREATE INDEX idx_agent_contacts_agent ON agent_contacts(agent_id);
CREATE INDEX idx_agent_deals_stage ON agent_deals(agent_id, stage);
CREATE INDEX idx_agent_activities_scheduled ON agent_activities(agent_id, scheduled_at);
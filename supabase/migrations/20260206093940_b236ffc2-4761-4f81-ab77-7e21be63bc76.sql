-- Tabela mapowania pracownik CRM → agent w systemie
CREATE TABLE IF NOT EXISTS crm_agent_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID REFERENCES agency_crm_integrations(id) ON DELETE CASCADE,
  crm_agent_id TEXT NOT NULL,
  crm_agent_name TEXT,
  crm_agent_email TEXT,
  crm_agent_phone TEXT,
  agent_id UUID REFERENCES real_estate_agents(id) ON DELETE SET NULL,
  auto_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration_id, crm_agent_id)
);

-- Dodać kolumny do real_estate_listings dla synchronizacji CRM
ALTER TABLE real_estate_listings 
ADD COLUMN IF NOT EXISTS crm_last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS crm_raw_data JSONB,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS virtual_tour_url TEXT;

-- Dodać brakujące kolumny do crm_import_logs (uzupełnienie struktury)
ALTER TABLE crm_import_logs 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running',
ADD COLUMN IF NOT EXISTS total_in_feed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS added_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS deactivated_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_crm_agent_mappings_integration ON crm_agent_mappings(integration_id);
CREATE INDEX IF NOT EXISTS idx_crm_agent_mappings_email ON crm_agent_mappings(crm_agent_email);
CREATE INDEX IF NOT EXISTS idx_real_estate_listings_external_id ON real_estate_listings(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_real_estate_listings_crm_source ON real_estate_listings(crm_source) WHERE crm_source IS NOT NULL;

-- RLS dla crm_agent_mappings
ALTER TABLE crm_agent_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agencje widzą mapowania swoich integracji" ON crm_agent_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agency_crm_integrations aci
      JOIN real_estate_agents rea ON rea.id = aci.agency_id
      WHERE aci.id = crm_agent_mappings.integration_id
      AND rea.user_id = auth.uid()
    )
  );

CREATE POLICY "Agencje mogą zarządzać mapowaniami" ON crm_agent_mappings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM agency_crm_integrations aci
      JOIN real_estate_agents rea ON rea.id = aci.agency_id
      WHERE aci.id = crm_agent_mappings.integration_id
      AND rea.user_id = auth.uid()
    )
  );

-- Trigger do aktualizacji updated_at
CREATE OR REPLACE TRIGGER update_crm_agent_mappings_updated_at
  BEFORE UPDATE ON crm_agent_mappings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
-- =====================================================
-- CZĘŚĆ 1: Rozszerzenie tabeli real_estate_listings
-- =====================================================

-- Dodaj nowe kolumny do tabeli listings
ALTER TABLE real_estate_listings 
ADD COLUMN IF NOT EXISTS comparison_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS contact_reveals_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS crm_source TEXT,
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES real_estate_agents(id);

-- Utwórz nową sekwencję dla numerów nieruchomości
CREATE SEQUENCE IF NOT EXISTS realestate_listing_seq START 1;

-- Utwórz funkcję generującą numer ogłoszenia z prefiksem NIE
CREATE OR REPLACE FUNCTION public.generate_realestate_listing_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_number IS NULL THEN
    NEW.listing_number := 'NIE-' || LPAD(nextval('realestate_listing_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Usuń stary trigger jeśli istnieje i dodaj nowy
DROP TRIGGER IF EXISTS set_realestate_listing_number ON real_estate_listings;
CREATE TRIGGER set_realestate_listing_number
  BEFORE INSERT ON real_estate_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_realestate_listing_number();

-- Indeks dla external_id (szybkie wyszukiwanie przy imporcie)
CREATE INDEX IF NOT EXISTS idx_real_estate_listings_external_id 
ON real_estate_listings(external_id) WHERE external_id IS NOT NULL;

-- =====================================================
-- CZĘŚĆ 2: Tabela interakcji z ogłoszeniami
-- =====================================================

CREATE TABLE IF NOT EXISTS real_estate_listing_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES real_estate_listings(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('favorite', 'compare', 'contact_reveal', 'view')),
  user_id UUID,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indeks dla szybkiego zliczania
CREATE INDEX IF NOT EXISTS idx_listing_interactions_listing 
ON real_estate_listing_interactions(listing_id, interaction_type);

-- RLS dla tabeli interakcji
ALTER TABLE real_estate_listing_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert interactions" ON real_estate_listing_interactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view interactions" ON real_estate_listing_interactions
  FOR SELECT USING (true);

-- =====================================================
-- CZĘŚĆ 3: Tabela dostawców CRM (globalna konfiguracja)
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_integration_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT UNIQUE NOT NULL,
  provider_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  supported_import_modes TEXT[] DEFAULT '{"xml_url", "ftp", "api"}',
  default_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Domyślni dostawcy CRM
INSERT INTO crm_integration_providers (provider_code, provider_name, is_enabled) VALUES
  ('esticrm', 'EstiCRM', false),
  ('asari', 'ASARI CRM', false),
  ('galactica', 'Galactica Virgo', false),
  ('imo', 'IMO CRM', false),
  ('custom', 'Inny CRM (Custom XML)', false)
ON CONFLICT (provider_code) DO NOTHING;

-- RLS dla tabeli dostawców
ALTER TABLE crm_integration_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view providers" ON crm_integration_providers
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage providers" ON crm_integration_providers
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- CZĘŚĆ 4: Tabela integracji agencji
-- =====================================================

CREATE TABLE IF NOT EXISTS agency_crm_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES real_estate_agents(id) ON DELETE CASCADE,
  provider_code TEXT REFERENCES crm_integration_providers(provider_code),
  is_enabled BOOLEAN DEFAULT false,
  import_mode TEXT NOT NULL CHECK (import_mode IN ('xml_url', 'ftp', 'api')),
  
  -- Konfiguracja URL XML
  xml_url TEXT,
  xml_login TEXT,
  xml_password_secret_name TEXT,
  
  -- Konfiguracja FTP
  ftp_host TEXT,
  ftp_port INTEGER DEFAULT 21,
  ftp_login TEXT,
  ftp_password_secret_name TEXT,
  ftp_xml_path TEXT,
  ftp_photos_path TEXT,
  
  -- Konfiguracja API
  api_base_url TEXT,
  api_key_secret_name TEXT,
  api_login TEXT,
  api_password_secret_name TEXT,
  
  -- Harmonogram
  import_schedule TEXT DEFAULT '24h' CHECK (import_schedule IN ('1h', '3h', '6h', '12h', '24h')),
  
  -- Status i statystyki
  last_import_at TIMESTAMPTZ,
  last_import_status TEXT CHECK (last_import_status IN ('success', 'error', 'partial', 'pending')),
  last_import_message TEXT,
  total_offers_in_feed INTEGER DEFAULT 0,
  added_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  deactivated_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(agency_id, provider_code)
);

-- RLS dla integracji agencji
ALTER TABLE agency_crm_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all integrations" ON agency_crm_integrations
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all integrations" ON agency_crm_integrations
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Agents can view own integrations" ON agency_crm_integrations
  FOR SELECT USING (
    agency_id IN (
      SELECT id FROM real_estate_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agents can manage own integrations" ON agency_crm_integrations
  FOR ALL USING (
    agency_id IN (
      SELECT id FROM real_estate_agents WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- CZĘŚĆ 5: Tabela logów importu
-- =====================================================

CREATE TABLE IF NOT EXISTS crm_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES agency_crm_integrations(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL CHECK (log_type IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indeks dla szybkiego pobierania ostatnich logów
CREATE INDEX IF NOT EXISTS idx_crm_import_logs_integration 
ON crm_import_logs(integration_id, created_at DESC);

-- RLS dla logów
ALTER TABLE crm_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all logs" ON crm_import_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Agents can view own logs" ON crm_import_logs
  FOR SELECT USING (
    integration_id IN (
      SELECT aci.id FROM agency_crm_integrations aci
      JOIN real_estate_agents rea ON rea.id = aci.agency_id
      WHERE rea.user_id = auth.uid()
    )
  );

-- =====================================================
-- CZĘŚĆ 6: Trigger dla updated_at
-- =====================================================

CREATE TRIGGER update_crm_providers_updated_at
  BEFORE UPDATE ON crm_integration_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agency_crm_integrations_updated_at
  BEFORE UPDATE ON agency_crm_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
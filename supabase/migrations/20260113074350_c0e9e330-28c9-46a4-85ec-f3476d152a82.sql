-- Tabela źródeł danych GTFS
CREATE TABLE gtfs_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('url', 'api', 'aggregator')),
  source_url TEXT,
  api_endpoint TEXT,
  api_key_secret_name TEXT,
  region TEXT,
  country TEXT DEFAULT 'PL',
  is_enabled BOOLEAN DEFAULT false,
  supports_realtime BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  sync_interval_hours INTEGER DEFAULT 24,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Wstawienie początkowych źródeł
INSERT INTO gtfs_data_sources (name, description, source_type, region, country) VALUES
('ZTM Warszawa', 'Zarząd Transportu Miejskiego w Warszawie', 'url', 'Warszawa', 'PL'),
('MPK Kraków', 'Miejskie Przedsiębiorstwo Komunikacyjne', 'url', 'Kraków', 'PL'),
('KZK GOP', 'Komunikacja Górnośląsko-Zagłębiowska', 'url', 'Śląsk', 'PL'),
('Transit.land', 'Globalny agregator GTFS', 'aggregator', NULL, NULL),
('OpenMobilityData', 'Agregator danych mobilności', 'aggregator', NULL, NULL);

-- Tabela cache danych transportowych dla lokalizacji
CREATE TABLE transit_location_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  geohash TEXT NOT NULL,
  
  -- Ujednolicony model danych
  stops_within_500m INTEGER DEFAULT 0,
  stops_within_1000m INTEGER DEFAULT 0,
  transport_types TEXT[] DEFAULT '{}',
  line_count INTEGER DEFAULT 0,
  avg_frequency_minutes DECIMAL(5,2),
  has_night_service BOOLEAN DEFAULT false,
  nearest_stop_distance_m INTEGER,
  nearest_stop_name TEXT,
  
  -- Ocena dla AI
  transport_score INTEGER CHECK (transport_score BETWEEN 0 AND 100),
  transport_rating TEXT CHECK (transport_rating IN ('excellent', 'good', 'moderate', 'limited', 'poor')),
  ai_summary TEXT,
  
  -- Metadane
  data_source_id UUID REFERENCES gtfs_data_sources(id),
  calculated_at TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  
  UNIQUE(geohash)
);

CREATE INDEX idx_transit_location_geohash ON transit_location_data(geohash);
CREATE INDEX idx_transit_location_coords ON transit_location_data(latitude, longitude);

-- RLS dla gtfs_data_sources
ALTER TABLE gtfs_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage GTFS sources" ON gtfs_data_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Anyone can read enabled GTFS sources" ON gtfs_data_sources
  FOR SELECT USING (is_enabled = true);

-- RLS dla transit_location_data
ALTER TABLE transit_location_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read transit data" ON transit_location_data
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage transit data" ON transit_location_data
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Trigger dla updated_at
CREATE TRIGGER update_gtfs_data_sources_updated_at
  BEFORE UPDATE ON gtfs_data_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
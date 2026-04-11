
-- Table 1: IC OAuth2 credentials per workshop
CREATE TABLE IF NOT EXISTS ic_catalog_integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid REFERENCES service_providers(id) ON DELETE CASCADE NOT NULL,
  ic_client_id text NOT NULL,
  ic_client_secret text NOT NULL,
  ic_access_token text,
  ic_token_expires_at timestamptz,
  is_enabled boolean DEFAULT false,
  last_sync_at timestamptz,
  last_sync_status text DEFAULT 'pending',
  last_sync_error text,
  catalog_size integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id)
);

ALTER TABLE ic_catalog_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_own_ic_integrations" ON ic_catalog_integrations
  FOR ALL USING (provider_id IN (
    SELECT id FROM service_providers WHERE user_id = auth.uid()
  ));

-- Table 2: local IC product catalog with FTS
CREATE TABLE IF NOT EXISTS ic_parts_catalog (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid REFERENCES service_providers(id) ON DELETE CASCADE NOT NULL,
  ic_sku text NOT NULL,
  ic_index text,
  ic_tecdoc_id text,
  name text NOT NULL,
  description text,
  manufacturer text,
  oe_number text,
  ean text,
  category_id text,
  category_label text,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name,'') || ' ' ||
      coalesce(manufacturer,'') || ' ' ||
      coalesce(ic_index,'') || ' ' ||
      coalesce(oe_number,'') || ' ' ||
      coalesce(category_label,'')
    )
  ) STORED,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, ic_sku)
);

CREATE INDEX IF NOT EXISTS idx_ic_parts_fts ON ic_parts_catalog USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_ic_parts_provider ON ic_parts_catalog(provider_id);
CREATE INDEX IF NOT EXISTS idx_ic_parts_sku ON ic_parts_catalog(provider_id, ic_sku);

ALTER TABLE ic_parts_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_own_ic_catalog" ON ic_parts_catalog
  FOR ALL USING (provider_id IN (
    SELECT id FROM service_providers WHERE user_id = auth.uid()
  ));


ALTER TABLE workshop_parts_integrations 
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS api_url text,
  ADD COLUMN IF NOT EXISTS api_extra_json jsonb DEFAULT '{}'::jsonb;

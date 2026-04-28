-- Add Meta-specific columns to external_lead_sources for Lead Ads integration
ALTER TABLE public.external_lead_sources
  ADD COLUMN IF NOT EXISTS meta_form_id text,
  ADD COLUMN IF NOT EXISTS meta_access_token text,
  ADD COLUMN IF NOT EXISTS meta_page_id text;

CREATE INDEX IF NOT EXISTS idx_external_lead_sources_meta_form_id ON public.external_lead_sources(meta_form_id) WHERE meta_form_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_external_lead_sources_client_id ON public.external_lead_sources(client_id);
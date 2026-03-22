CREATE TABLE IF NOT EXISTS public.translations_cache (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type     text NOT NULL,
  entity_id       text NOT NULL,
  field_name      text NOT NULL,
  source_lang     text NOT NULL DEFAULT 'pl',
  target_lang     text NOT NULL,
  source_hash     text NOT NULL,
  translated_text text NOT NULL,
  translated_by   text DEFAULT 'kimi',
  access_count    integer DEFAULT 1,
  last_accessed   timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE(entity_type, entity_id, field_name, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_trans_lookup ON public.translations_cache(entity_type, entity_id, target_lang);

ALTER TABLE public.translations_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trans_public_read" ON public.translations_cache FOR SELECT USING (true);
CREATE POLICY "trans_service_write" ON public.translations_cache FOR ALL USING (auth.role() = 'service_role');
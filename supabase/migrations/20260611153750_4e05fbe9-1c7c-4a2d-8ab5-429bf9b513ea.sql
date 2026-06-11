ALTER TABLE public.workshop_employees
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'pl';

CREATE TABLE IF NOT EXISTS public.workshop_translations_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  source_lang text NOT NULL DEFAULT 'pl',
  target_lang text NOT NULL,
  source_hash text NOT NULL,
  source_text text NOT NULL,
  translated_text text NOT NULL,
  translated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workshop_trans_uq
  ON public.workshop_translations_cache (entity_type, entity_id, field, target_lang);
CREATE INDEX IF NOT EXISTS workshop_trans_lookup
  ON public.workshop_translations_cache (entity_type, entity_id, target_lang);

GRANT SELECT, INSERT, UPDATE ON public.workshop_translations_cache TO authenticated;
GRANT ALL ON public.workshop_translations_cache TO service_role;

ALTER TABLE public.workshop_translations_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read translations cache" ON public.workshop_translations_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert translations cache" ON public.workshop_translations_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update translations cache" ON public.workshop_translations_cache FOR UPDATE TO authenticated USING (true);

INSERT INTO public.ai_agents_config (agent_id, name, description, model, is_active, created_at, updated_at)
VALUES ('workshop_translation', 'Tłumaczenia warsztatu', 'AI do tłumaczenia zleceń, pozycji i notatek warsztatu na język pracownika i z powrotem na język admina', 'moonshot-v1-8k', true, now(), now())
ON CONFLICT (agent_id) DO NOTHING;
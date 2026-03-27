CREATE TABLE public.workspace_message_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  language_code text NOT NULL,
  translated_text text NOT NULL,
  source_language text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, language_code)
);

ALTER TABLE public.workspace_message_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read translations" ON public.workspace_message_translations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "System can insert translations" ON public.workspace_message_translations
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_msg_translations_lookup ON public.workspace_message_translations(message_id, language_code);
-- Jeden globalny rekord routingu LLM dla rozmów telefonicznych.
-- ElevenLabs pozostaje warstwą głosu; ai_function_mapping.voice_agent steruje
-- wyłącznie modelem tekstowym obsługującym bieżącą turę rozmowy.

ALTER TABLE public.ai_function_mapping
  ADD COLUMN IF NOT EXISTS backup_model_override text,
  ADD COLUMN IF NOT EXISTS model_timeout_ms integer NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS max_tool_rounds integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_output_tokens integer NOT NULL DEFAULT 400;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_function_mapping_model_timeout_range'
      AND conrelid = 'public.ai_function_mapping'::regclass
  ) THEN
    ALTER TABLE public.ai_function_mapping ADD CONSTRAINT ai_function_mapping_model_timeout_range
      CHECK (model_timeout_ms BETWEEN 1000 AND 30000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_function_mapping_tool_rounds_range'
      AND conrelid = 'public.ai_function_mapping'::regclass
  ) THEN
    ALTER TABLE public.ai_function_mapping ADD CONSTRAINT ai_function_mapping_tool_rounds_range
      CHECK (max_tool_rounds BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_function_mapping_output_tokens_range'
      AND conrelid = 'public.ai_function_mapping'::regclass
  ) THEN
    ALTER TABLE public.ai_function_mapping ADD CONSTRAINT ai_function_mapping_output_tokens_range
      CHECK (max_output_tokens BETWEEN 64 AND 800);
  END IF;
END $$;

INSERT INTO public.ai_function_mapping (
  function_key, function_name, function_description, category,
  provider_key, model_override, backup_provider_key, backup_model_override,
  allow_fallback, is_enabled, sort_order,
  model_timeout_ms, max_tool_rounds, max_output_tokens
) VALUES (
  'voice_agent',
  'Model rozmów telefonicznych',
  'Globalny LLM sterujący bieżącą rozmową telefoniczną; ElevenLabs obsługuje głos.',
  'voice',
  'claude_sonnet', 'claude-sonnet-4-6',
  'claude_haiku', 'claude-haiku-4-5-20251001',
  true, true, 9, 15000, 3, 400
)
-- Produkcyjny canary nie może pośrednio przełączyć pozostałych agentów.
-- Istniejący rekord (wraz z nazwą, modelem i fallbackiem) pozostaje dokładnie
-- bez zmian. Administrator wybierze LLM jawnie po wdrożeniu, a runtime odczyta
-- go tylko dla pary przepuszczonej przez bramkę canary.
ON CONFLICT (function_key) DO NOTHING;

-- Rekord voice_agent może być zmieniany wyłącznie przez admin-only Edge
-- Function, która waliduje aktywność dostawcy, klucz i obsługiwany model.
DROP POLICY IF EXISTS "Admins can manage ai_function_mapping" ON public.ai_function_mapping;
DROP POLICY IF EXISTS "Admins manage non-voice ai_function_mapping" ON public.ai_function_mapping;
CREATE POLICY "Admins manage non-voice ai_function_mapping"
ON public.ai_function_mapping
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND function_key <> 'voice_agent')
WITH CHECK (public.has_role(auth.uid(), 'admin') AND function_key <> 'voice_agent');

-- Legacy ai_providers.api_key_encrypted nie może być zwracane przez PostgREST.
-- Konfiguracja bez sekretów pozostaje edytowalna dla admina; klucze przechodzą
-- wyłącznie przez admin-ai-secrets i ai_secret_store.
REVOKE ALL ON public.ai_providers FROM authenticated;
GRANT SELECT (
  id, provider_key, display_name, is_enabled, default_model,
  timeout_seconds, daily_limit, admin_note, created_at, updated_at
) ON public.ai_providers TO authenticated;
GRANT UPDATE (
  display_name, is_enabled, default_model, timeout_seconds,
  daily_limit, admin_note, updated_at
) ON public.ai_providers TO authenticated;

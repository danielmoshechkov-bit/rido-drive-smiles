-- ============================================================================
-- VOICE AGENT CONFIG — tryb wielojęzyczny głosu
-- ----------------------------------------------------------------------------
-- Domyślnie JEDEN multilingual głos obsługuje całą rozmowę (PL/EN/UA/RU) —
-- ElevenLabs eleven_multilingual_v2 mówi w języku rozmówcy automatycznie.
-- Opcja zaawansowana: osobny głos na każdy język (voice_per_language).
-- Additive + idempotent. Wymaga voice_agent_configs (150000).
-- ============================================================================

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS voice_mode         text  NOT NULL DEFAULT 'single',     -- single | per_language
  ADD COLUMN IF NOT EXISTS voice_per_language jsonb NOT NULL DEFAULT '{}'::jsonb;   -- {pl: voiceId, en:..., ua:..., ru:...}

-- ============================================================================
-- VOICE AGENT CONFIG — zaawansowane ustawienia głosu ElevenLabs
-- ----------------------------------------------------------------------------
-- Panel self-service pozwala regulować brzmienie głosu (suwaki) + przycisk
-- "Optymalne ustawienia" (nasze sprawdzone wartości na naturalne brzmienie).
-- Domyślne wartości = naturalne brzmienie (nie-robotyczne):
--   stability 0.45, similarity 0.75, style 0.0 (speed już dodane w 170000).
-- Additive + idempotent. Wymaga voice_agent_configs (migracja 150000).
-- ============================================================================

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS voice_stability  numeric(3,2) NOT NULL DEFAULT 0.45,  -- 0..1 (niżej = bardziej żywo/zmiennie)
  ADD COLUMN IF NOT EXISTS voice_similarity numeric(3,2) NOT NULL DEFAULT 0.75,  -- 0..1 (podobieństwo do oryginału)
  ADD COLUMN IF NOT EXISTS voice_style      numeric(3,2) NOT NULL DEFAULT 0.0;   -- 0..1 (ekspresja stylu; niski = naturalny)

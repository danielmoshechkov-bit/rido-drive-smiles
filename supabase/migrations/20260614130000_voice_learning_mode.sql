-- ============================================================================
-- VOICE AGENT — tryb uczenia (cadence analizy rozmów)
-- ----------------------------------------------------------------------------
-- per_call  = analizuj i ucz się po KAŻDEJ rozmowie (mało userów — najszybsza nauka)
-- batched   = zbieraj wyniki, destyluj wsadowo (cron co kilka dni — przy skali)
-- off       = bez uczenia
-- Additive + idempotent.
-- ============================================================================

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS learning_mode text NOT NULL DEFAULT 'per_call';

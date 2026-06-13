-- ============================================================================
-- VOICE AGENT CONFIG — dodatkowe pola głosu (szybkość + tekst przykładowy)
-- ----------------------------------------------------------------------------
-- Tenant w panelu "Asystent głosowy" wybiera głos, szybkość mowy i tekst
-- przykładowy (do odsłuchu / powitania). Core (20260613150000) nie miał tych
-- pól. Additive + idempotentne (ADD COLUMN IF NOT EXISTS).
--
-- WYMAGA wcześniej zastosowanej migracji 20260613150000_voice_agent_core.sql
-- (tabela voice_agent_configs). Jeśli jeszcze nie wdrożona — najpierw 150000.
-- ============================================================================

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS voice_speed numeric(3,2) NOT NULL DEFAULT 1.0,  -- 0.7–1.2 (ElevenLabs voice_settings.speed)
  ADD COLUMN IF NOT EXISTS sample_text text;                                -- tekst do odsłuchu / powitanie agenta

-- ============================================================================
-- VOICE AGENT CONFIG — przełączniki dostępu (uprawnienia agenta)
-- ----------------------------------------------------------------------------
-- Per-tenant zgody na działania agenta (egzekwowane w Etapie 1 przez
-- voice-agent-tools przed wykonaniem narzędzia):
--   calendar_access -> sprawdzanie wolnych terminów, umawianie, przekładanie, odwoływanie
--   orders_access   -> tworzenie nowych zleceń (workshop_orders) trafiających do systemu
-- Additive + idempotent. Wymaga voice_agent_configs (150000).
-- ============================================================================

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS calendar_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orders_access   boolean NOT NULL DEFAULT false;

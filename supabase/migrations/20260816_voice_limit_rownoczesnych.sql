-- ============================================================================
-- LIMIT ROZMÓW RÓWNOCZESNYCH — po naszej stronie, bo operator go nie da.
--
-- `VoipNumber.incomingCallLimit` u SuperVoIP jest TYLKO DO ODCZYTU (nie ma go
-- w ciele PUT), a ElevenLabs limituje per agent — a agenta mamy jednego dla
-- wszystkich warsztatów. Zostaje nasza baza.
--
-- Wartość jest KOLUMNĄ, nie stałą w kodzie: limit ma wynikać z pakietu
-- warsztatu (Agent = 1, Agent Pro = 3). Dopóki pakiety nie działają, każdy
-- ma 1 i da się to nadpisać pojedynczemu warsztatowi bez wdrożenia.
-- ============================================================================
ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS max_rozmow_rownoczesnie integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voice_agent_configs_max_rozmow_sensowny'
  ) THEN
    ALTER TABLE public.voice_agent_configs
      ADD CONSTRAINT voice_agent_configs_max_rozmow_sensowny
      CHECK (max_rozmow_rownoczesnie BETWEEN 1 AND 20);
  END IF;
END $$;

COMMENT ON COLUMN public.voice_agent_configs.max_rozmow_rownoczesnie IS
  'Ile rozmów naraz obsługuje ten warsztat. Docelowo z pakietu (Agent=1, Agent Pro=3). Czytane przez voice-agent-init.';

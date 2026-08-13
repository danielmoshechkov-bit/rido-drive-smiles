-- ============================================================================
-- voice-keep-warm-init-20260812.sql   — DO ZATWIERDZENIA
--
-- Czwarty cron podtrzymujący, identyczny w kształcie z trzema istniejącymi
-- (voice-keep-warm-chat / -llm / -tools). Token z Vault, nie wprost w treści.
--
-- PO CO: webhook inicjujący ma budżet 300 ms i przy przekroczeniu oddaje PUSTY
-- snapshot. Zmierzone 12.08:
--     wywołanie na zimnym izolacie  -> snapshot PUSTY (budżet przekroczony)
--     wywołanie ciepłe              -> 166-212 ms, snapshot pełny
-- Bez podtrzymania pierwsza rozmowa po przerwie traci wszystkie terminy i agent
-- wraca do check_availability, czyli do tury 5-7 s. Dokładnie tego, co FAZA A usuwa.
--
-- Opóźnienie tej funkcji idzie PROSTO w czas odebrania połączenia, więc zimny
-- start jest tu droższy niż w pozostałych funkcjach.
--
-- Rollback: voice-keep-warm-init-20260812-rollback.sql
-- ============================================================================

SELECT cron.schedule(
  'voice-keep-warm-init',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-agent-init/warmup',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'VOICE_LLM_TOKEN' LIMIT 1)
    )
  );
  $$
);

-- KONTROLA: SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'voice-keep-warm%';
--           ma zwrócić cztery wiersze

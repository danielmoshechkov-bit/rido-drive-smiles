-- ============================================================================
-- voice-keep-warm-consolidate-20260812.sql   — DO ZATWIERDZENIA
--
-- CZTERY CRONY PODTRZYMUJĄCE -> JEDEN.
--
-- Dziś cztery osobne zadania co minutę (chat, llm, tools, init) dopisują
-- CZTERY wiersze na minutę do cron.job_run_details: 5 760 dziennie, 57% całego
-- przyrostu tej tabeli. Sama praca jest trywialna — cztery żądania HTTP przez
-- pg_net, który i tak jest asynchroniczny, więc równie dobrze mieszczą się
-- w jednym zadaniu.
--
-- Efekt: 1 440 wierszy dziennie zamiast 5 760. Podtrzymywanie działa identycznie,
-- bo pg_net wysyła wszystkie cztery żądania bez czekania na odpowiedzi.
--
-- Rollback: voice-keep-warm-consolidate-20260812-rollback.sql (przywraca cztery).
-- ============================================================================

SELECT cron.unschedule('voice-keep-warm-chat');
SELECT cron.unschedule('voice-keep-warm-llm');
SELECT cron.unschedule('voice-keep-warm-tools');
SELECT cron.unschedule('voice-keep-warm-init');

SELECT cron.schedule(
  'voice-keep-warm',
  '* * * * *',
  $$
  WITH token AS (
    SELECT decrypted_secret AS t FROM vault.decrypted_secrets WHERE name = 'VOICE_LLM_TOKEN' LIMIT 1
  )
  SELECT net.http_get(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/' || f || '/warmup',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT t FROM token))
  )
  FROM unnest(ARRAY['voice-agent-chat','voice-agent-llm','voice-agent-tools','voice-agent-init']) AS f;
  $$
);

-- KONTROLA: SELECT jobname FROM cron.job WHERE jobname LIKE 'voice-keep-warm%';
--           ma zwrócić JEDEN wiersz

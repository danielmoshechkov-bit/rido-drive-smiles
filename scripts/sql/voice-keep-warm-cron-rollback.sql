-- ODWRÓCENIE scripts/sql/voice-keep-warm-cron.sql
-- Usuwa oba zadania keep-warm. Nie dotyka pozostałych cronów projektu.

SELECT cron.unschedule('voice-keep-warm-llm')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-keep-warm-llm');
SELECT cron.unschedule('voice-keep-warm-chat') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-keep-warm-chat');

-- Weryfikacja: oczekiwane zero wierszy.
SELECT jobname FROM cron.job WHERE jobname LIKE 'voice-keep-warm%';

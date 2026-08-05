-- KEEP-WARM dla ścieżki telefonicznej agenta głosowego.
--
-- POWÓD (zmierzone, nie szacowane):
--   pełny łańcuch voice-agent-llm -> voice-agent-chat, pierwszy token:
--     zimny start : 3,422 s
--     rozgrzany   : 1,343-1,561 s  (mediana 1,46 s)
--   różnica ~1,96 s obciąża KAŻDĄ rozmowę, bo warsztat odbiera telefon
--   raz na godzinę i funkcje zdążają się uśpić. To dokładnie te "3,4 s",
--   które ElevenLabs raportował jako czas do pierwszego zdania.
--
-- ZASADA: pingujemy tak, żeby funkcja WSTAŁA, ale NIE wywołała modelu.
--   voice-agent-llm  : GET  -> zwraca {"ok":true} bez dotykania bazy i modelu
--   voice-agent-chat : POST bez autoryzacji -> 401 z własnego kodu funkcji,
--                      czyli runtime wstaje, a model nie jest wołany.
--   Żaden z tych requestów nie kosztuje tokenów Anthropic ani kredytów SMS.
--
-- CZĘSTOTLIWOŚĆ: co minutę, nie co 30 s. Funkcje edge trzymają ciepło
-- znacznie dłużej niż minutę, a wszystkie istniejące crony w tym projekcie
-- używają tej samej granulacji. Dwa razy częstszy ping podwoiłby liczbę
-- wywołań bez mierzalnego zysku.
--
-- ODWRÓCENIE: scripts/sql/voice-keep-warm-cron-rollback.sql

-- Idempotencja: usuń poprzednie wersje zadań, jeśli istnieją.
SELECT cron.unschedule('voice-keep-warm-llm')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-keep-warm-llm');
SELECT cron.unschedule('voice-keep-warm-chat') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-keep-warm-chat');

-- 1) voice-agent-llm — GET /  (health, bez bazy i bez modelu)
SELECT cron.schedule(
  'voice-keep-warm-llm',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-agent-llm',
    timeout_milliseconds := 5000
  );
  $$
);

-- 2) voice-agent-chat — POST bez autoryzacji (401 z kodu funkcji, model nietknięty)
SELECT cron.schedule(
  'voice-keep-warm-chat',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-agent-chat',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"keep_warm":true}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);

-- Weryfikacja
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'voice-keep-warm%'
ORDER BY jobname;

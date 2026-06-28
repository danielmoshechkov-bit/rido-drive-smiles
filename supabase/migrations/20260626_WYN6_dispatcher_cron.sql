-- =====================================================================
-- WYN6 — Harmonogram dispatchera (OUTBOX poller)
-- Paczka 1 (fundament modularności).
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 1.2, sekwencja krok 1)
--
-- !!! KOLEJNOŚĆ WDROŻENIA !!!
--   Ta migracja zakłada, że edge function `rental-dispatcher` jest JUŻ
--   WDROŻONA (deploy funkcji PRZED uruchomieniem tego crona).
--   Inaczej net.http_post będzie trafiał na nieistniejący endpoint (404).
--   Kolejność: 1) deploy funkcji rental-dispatcher  2) ta migracja.
--
-- Wzorzec skopiowany z istniejącego crona 'workshop-scheduled-sms-dispatch'
-- (pg_cron + pg_net, Bearer = klucz anon projektu).
-- Poller co minutę = trakt główny (trwała gwarancja dostarczenia);
-- pg_notify (WYN2) jest tylko akceleratorem.
-- =====================================================================

-- Idempotencja harmonogramu: usuń poprzedni wpis o tej nazwie, jeśli istnieje.
DO $$
BEGIN
  PERFORM cron.unschedule('rental-dispatcher');
EXCEPTION WHEN OTHERS THEN
  NULL; -- brak wcześniejszego harmonogramu = nic do usunięcia
END $$;

SELECT cron.schedule(
  'rental-dispatcher',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/rental-dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- =====================================================================
-- WERYFIKACJA:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname='rental-dispatcher';
-- ODŁĄCZENIE (rollback):
--   SELECT cron.unschedule('rental-dispatcher');
-- =====================================================================

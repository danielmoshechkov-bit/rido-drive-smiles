-- ============================================================================
-- CRON JOBS — uruchom raz w SQL Editor Supabase
-- https://supabase.com/dashboard/project/wclrrytmrscqvsyxyvnn/sql/new
-- ============================================================================

-- Włącz rozszerzenia (jeśli jeszcze nie włączone)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) Co godzinę: wysyłaj prośby o ocenę 24h+ po zakończonych zleceniach
SELECT cron.schedule(
  'booking-review-reminder-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/booking-review-reminder',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- 2) 1. dnia każdego miesiąca o 03:00: generuj faktury prowizyjne za poprzedni miesiąc
SELECT cron.schedule(
  'commission-monthly-billing',
  '0 3 1 * *',
  $$
  SELECT net.http_post(
    url:='https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/commission-monthly-billing',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Sprawdzenie / usuwanie:
-- SELECT * FROM cron.job;
-- SELECT cron.unschedule('booking-review-reminder-hourly');
-- SELECT cron.unschedule('commission-monthly-billing');

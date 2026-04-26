CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Usuń stare joby jeśli istnieją (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-external-leads-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-queue-hot-leads-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Sync zewnętrznych źródeł leadów co 15 minut
SELECT cron.schedule(
  'sync-external-leads-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/sync-external-leads',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Auto-queue hot leadów co 5 minut
SELECT cron.schedule(
  'auto-queue-hot-leads-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/auto-queue-hot-leads',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
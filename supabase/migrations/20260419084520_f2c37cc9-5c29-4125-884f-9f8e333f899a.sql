-- Enable required extensions for scheduled SMS dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove previous schedule if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workshop-scheduled-sms-dispatch') THEN
    PERFORM cron.unschedule('workshop-scheduled-sms-dispatch');
  END IF;
END $$;

-- Schedule SMS dispatcher to run every minute
SELECT cron.schedule(
  'workshop-scheduled-sms-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/workshop-send-scheduled-sms',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
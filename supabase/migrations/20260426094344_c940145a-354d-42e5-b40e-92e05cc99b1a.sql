SELECT cron.unschedule('booking-reminders-cron');

SELECT cron.schedule(
  'booking-reminders-cron',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/booking-reminders',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Catch-up
SELECT net.http_post(
  url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/booking-reminders',
  headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk"}'::jsonb,
  body := '{}'::jsonb
) AS catchup_request_id;
-- Add RLS policy for drivers to view their own system alerts
CREATE POLICY "Drivers can view their own system alerts"
ON public.system_alerts
FOR SELECT
TO public
USING (
  driver_id IN (
    SELECT driver_id 
    FROM driver_app_users 
    WHERE user_id = auth.uid()
  )
);

-- Add test notification for Beata with correct category
INSERT INTO public.system_alerts (
  driver_id,
  type,
  category,
  title,
  description,
  status
) VALUES (
  '29ea99fc-bc45-422c-b293-5cea1739def0',
  'info',
  'system',
  'Witaj w systemie Rido!',
  'Twoje konto zostało aktywowane. Możesz teraz przeglądać rozliczenia paliwowe i tygodniowe.',
  'pending'
);
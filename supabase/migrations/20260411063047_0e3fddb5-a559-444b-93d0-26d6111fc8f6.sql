ALTER TABLE public.workshop_client_bookings 
ADD COLUMN IF NOT EXISTS reminder_times text[] DEFAULT '{"24h","2h"}',
ADD COLUMN IF NOT EXISTS confirmation_sms_sent boolean DEFAULT false;
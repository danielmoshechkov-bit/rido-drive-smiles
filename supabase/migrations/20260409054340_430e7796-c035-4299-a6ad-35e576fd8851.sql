UPDATE sms_settings SET sender_name = 'GetRido.pl' WHERE sender_name = 'Test';

ALTER TABLE workshop_orders ADD COLUMN IF NOT EXISTS scheduled_date timestamptz;
ALTER TABLE workshop_orders ADD COLUMN IF NOT EXISTS scheduled_station text;
ALTER TABLE workshop_orders ADD COLUMN IF NOT EXISTS sms_reminder_24h bool DEFAULT true;
ALTER TABLE workshop_orders ADD COLUMN IF NOT EXISTS sms_reminder_2h bool DEFAULT true;
ALTER TABLE workshop_orders ADD COLUMN IF NOT EXISTS sms_confirmed bool DEFAULT false;
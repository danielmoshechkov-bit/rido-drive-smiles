-- Add SMS balance to service providers
ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS sms_balance INT DEFAULT 0;

-- Give "Warsztat Testowy" 100 SMS credits
UPDATE public.service_providers SET sms_balance = 100 WHERE id = '664ed87b-a20f-457b-a9fa-97ca13dcae7c';

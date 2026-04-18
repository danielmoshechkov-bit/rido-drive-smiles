ALTER TABLE public.ksef_settings 
ADD COLUMN IF NOT EXISTS auto_send_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ksef_settings.auto_send_enabled IS 
'Czy faktury mają być automatycznie wysyłane do KSeF po wystawieniu. Domyślnie OFF.';
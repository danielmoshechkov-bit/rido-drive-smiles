-- Add custom weekly fee override for individual drivers
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS custom_weekly_fee numeric DEFAULT NULL;

COMMENT ON COLUMN public.drivers.custom_weekly_fee IS 'Per-driver weekly service fee override. If set, this takes priority over fleet global fee.';
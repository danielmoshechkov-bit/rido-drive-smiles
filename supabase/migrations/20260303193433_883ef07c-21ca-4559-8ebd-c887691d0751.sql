
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS scheduled_end timestamptz;

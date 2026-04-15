
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS payout_frequency TEXT NOT NULL DEFAULT 'weekly'
CHECK (payout_frequency IN ('weekly', 'monthly', 'on_demand'));

COMMENT ON COLUMN public.drivers.payout_frequency IS 'Częstotliwość wypłat: weekly, monthly, on_demand';

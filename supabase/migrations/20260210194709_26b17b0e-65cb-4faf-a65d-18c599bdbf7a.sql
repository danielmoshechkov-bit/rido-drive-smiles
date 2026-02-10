-- Add owner rental fee - how much the fleet pays to the vehicle owner per week
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS owner_rental_fee numeric DEFAULT NULL;

COMMENT ON COLUMN public.vehicles.owner_rental_fee IS 'Weekly fee the fleet pays to the vehicle owner. Separate from weekly_rental_fee which is what the driver pays.';
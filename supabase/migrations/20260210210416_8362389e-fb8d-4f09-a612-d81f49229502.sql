
-- Add Uber-specific settlement settings to fleets table
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS uber_vat_rate numeric DEFAULT 8;
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS uber_base_fee numeric DEFAULT 0;
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS uber_settlement_mode text DEFAULT 'single_tax';
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS uber_calculation_mode text DEFAULT 'netto';
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS uber_secondary_vat_rate numeric DEFAULT 23;
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS uber_additional_percent_rate numeric DEFAULT 0;

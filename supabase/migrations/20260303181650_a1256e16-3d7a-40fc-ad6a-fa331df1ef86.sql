
-- Add scheduling columns to workshop_orders
ALTER TABLE public.workshop_orders
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_station_id text,
  ADD COLUMN IF NOT EXISTS damage_description text;

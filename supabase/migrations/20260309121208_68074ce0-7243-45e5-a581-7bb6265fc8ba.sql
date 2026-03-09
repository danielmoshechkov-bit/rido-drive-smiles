ALTER TABLE public.drivers 
  ADD COLUMN IF NOT EXISTS b2b_street text,
  ADD COLUMN IF NOT EXISTS b2b_building_number text,
  ADD COLUMN IF NOT EXISTS b2b_apartment_number text,
  ADD COLUMN IF NOT EXISTS b2b_postal_code text,
  ADD COLUMN IF NOT EXISTS b2b_city text;
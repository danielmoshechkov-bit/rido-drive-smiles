-- Make vehicle_id nullable for standalone marketplace listings
ALTER TABLE public.vehicle_listings ALTER COLUMN vehicle_id DROP NOT NULL;
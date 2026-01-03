-- Add contact_name column to vehicle_listings
ALTER TABLE public.vehicle_listings 
ADD COLUMN IF NOT EXISTS contact_name text;
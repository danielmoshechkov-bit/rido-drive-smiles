-- Add description column to vehicle_listings table
ALTER TABLE public.vehicle_listings 
ADD COLUMN IF NOT EXISTS description TEXT;
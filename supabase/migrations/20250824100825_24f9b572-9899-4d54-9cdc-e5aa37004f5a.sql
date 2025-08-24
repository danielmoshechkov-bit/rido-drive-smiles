-- Add missing columns to fleets table for fleet registration data
ALTER TABLE public.fleets 
ADD COLUMN IF NOT EXISTS nip text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS contact_name text,
ADD COLUMN IF NOT EXISTS phone text;
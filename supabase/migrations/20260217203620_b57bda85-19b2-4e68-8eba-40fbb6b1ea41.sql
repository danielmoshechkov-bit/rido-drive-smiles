-- Add logo_url to fleets table for contract branding
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add krs column for contract display
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS krs TEXT;
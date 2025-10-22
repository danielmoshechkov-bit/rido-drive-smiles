-- Add getrido_id column to drivers table for unique driver identification
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS getrido_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_drivers_getrido_id 
ON public.drivers(getrido_id) 
WHERE getrido_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.drivers.getrido_id IS 'Unique GetRido identifier for driver matching in CSV imports';
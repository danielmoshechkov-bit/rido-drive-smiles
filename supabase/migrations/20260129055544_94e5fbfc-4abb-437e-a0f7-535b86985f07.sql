-- Add is_featured column to services table
-- This allows service providers to mark which services to display prominently on cards
ALTER TABLE public.services 
ADD COLUMN is_featured BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX idx_services_is_featured ON public.services(is_featured) WHERE is_featured = true;
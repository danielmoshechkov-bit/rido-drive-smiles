-- Universal listing numbers table for all marketplaces
CREATE TABLE public.universal_listing_numbers (
  listing_number TEXT PRIMARY KEY,
  marketplace_type TEXT NOT NULL CHECK (marketplace_type IN ('real_estate', 'vehicles', 'services')),
  listing_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.universal_listing_numbers ENABLE ROW LEVEL SECURITY;

-- RLS policies - public read, authenticated insert
CREATE POLICY "Anyone can view listing numbers"
  ON public.universal_listing_numbers
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert listing numbers"
  ON public.universal_listing_numbers
  FOR INSERT
  WITH CHECK (true);

-- Function to generate unique random 5-digit listing number
CREATE OR REPLACE FUNCTION public.generate_random_listing_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  attempts INT := 0;
  max_attempts INT := 100;
BEGIN
  LOOP
    -- Generate random 5-digit number (10000-99999)
    new_number := (10000 + floor(random() * 90000))::TEXT;
    
    -- Check if it already exists
    IF NOT EXISTS (SELECT 1 FROM public.universal_listing_numbers WHERE listing_number = new_number) THEN
      RETURN new_number;
    END IF;
    
    attempts := attempts + 1;
    IF attempts >= max_attempts THEN
      -- Fallback: generate 6-digit number
      RETURN (100000 + floor(random() * 900000))::TEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Index for faster lookups
CREATE INDEX idx_universal_listing_numbers_listing ON public.universal_listing_numbers(listing_id);
CREATE INDEX idx_universal_listing_numbers_marketplace ON public.universal_listing_numbers(marketplace_type);

-- Create the "Nieruchomości Premium" agency account
-- First, create the auth user via admin API (this will be done in edge function)
-- Then insert the agent record

-- Insert or update the real_estate_agents record for the test account
-- We'll use a placeholder user_id that will be updated when the auth user is created
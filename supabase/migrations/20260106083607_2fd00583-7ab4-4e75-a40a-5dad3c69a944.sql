-- Add listing_number column to vehicle_listings
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS listing_number TEXT UNIQUE;

-- Create sequence for listing numbers
CREATE SEQUENCE IF NOT EXISTS listing_number_seq START 1;

-- Create function to generate listing number
CREATE OR REPLACE FUNCTION generate_listing_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.listing_number IS NULL THEN
    NEW.listing_number := 'RIDO-' || LPAD(nextval('listing_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic listing number generation
DROP TRIGGER IF EXISTS set_listing_number ON vehicle_listings;
CREATE TRIGGER set_listing_number
  BEFORE INSERT ON vehicle_listings
  FOR EACH ROW
  EXECUTE FUNCTION generate_listing_number();

-- Update existing records with listing numbers
DO $$
DECLARE
  rec RECORD;
  counter INTEGER := 1;
BEGIN
  FOR rec IN SELECT id FROM vehicle_listings WHERE listing_number IS NULL ORDER BY created_at LOOP
    UPDATE vehicle_listings 
    SET listing_number = 'RIDO-' || LPAD(counter::text, 6, '0')
    WHERE id = rec.id;
    counter := counter + 1;
  END LOOP;
  
  -- Set sequence to next value after existing records
  PERFORM setval('listing_number_seq', GREATEST(counter, 1));
END $$;
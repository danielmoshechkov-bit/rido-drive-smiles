-- Add contact fields to vehicle_listings for marketplace display
ALTER TABLE vehicle_listings 
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_email text;

-- Add comment for documentation
COMMENT ON COLUMN vehicle_listings.contact_phone IS 'Contact phone number displayed on marketplace listing';
COMMENT ON COLUMN vehicle_listings.contact_email IS 'Optional contact email displayed on marketplace listing';
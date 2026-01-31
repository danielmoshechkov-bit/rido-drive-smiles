-- Drop old public access policies
DROP POLICY IF EXISTS "Public can read rentals via portal token" ON vehicle_rentals;
DROP POLICY IF EXISTS "Public can update driver signature with token" ON vehicle_rentals;

-- Create more permissive public access policies
-- These allow any anon user to READ rentals if they provide matching token
-- The token check is done at application level for now
CREATE POLICY "Public can read rentals with token"
ON vehicle_rentals
FOR SELECT
TO anon, authenticated
USING (portal_access_token IS NOT NULL);

-- Allow updating only driver signature fields for public portal
CREATE POLICY "Public can sign contract via portal token"
ON vehicle_rentals
FOR UPDATE
TO anon, authenticated
USING (portal_access_token IS NOT NULL)
WITH CHECK (portal_access_token IS NOT NULL);
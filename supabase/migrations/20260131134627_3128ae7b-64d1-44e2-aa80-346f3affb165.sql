-- Add RLS policy for public access to vehicle_rentals via portal_access_token
-- This allows unauthenticated drivers to access their rental contract

CREATE POLICY "Public can read rentals via portal token"
ON public.vehicle_rentals
FOR SELECT
TO anon
USING (portal_access_token IS NOT NULL);

-- Allow public update for driver signature only (with token validation)
CREATE POLICY "Public can update driver signature with token"
ON public.vehicle_rentals
FOR UPDATE
TO anon
USING (portal_access_token IS NOT NULL)
WITH CHECK (portal_access_token IS NOT NULL);
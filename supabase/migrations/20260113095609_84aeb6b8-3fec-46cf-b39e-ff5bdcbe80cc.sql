-- Add public SELECT policy for Google Places API key configuration
-- This allows all users to read the Google Maps API key (which is public by nature)
CREATE POLICY "Anyone can read google_places config"
ON public.location_integrations
FOR SELECT
USING (provider = 'google_places');
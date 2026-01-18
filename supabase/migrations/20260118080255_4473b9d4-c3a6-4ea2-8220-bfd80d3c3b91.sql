-- Add driver_locations table for Fleet Live
CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  speed FLOAT8,
  heading FLOAT8,
  accuracy FLOAT8,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT driver_locations_user_id_unique UNIQUE (user_id)
);

-- Index for quick filtering of active drivers
CREATE INDEX idx_driver_locations_active ON public.driver_locations (is_active, updated_at);

-- Enable RLS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- User can upsert only their own record
CREATE POLICY "Users can upsert own location"
  ON public.driver_locations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin and fleet managers can read all locations
CREATE POLICY "Admins and fleet can read all locations"
  ON public.driver_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND role IN ('admin', 'fleet_rental', 'fleet_settlement')
    )
  );

-- Add navigation config options to maps_config
INSERT INTO public.maps_config (config_key, config_value) VALUES
  ('follow_mode_zoom', '16'),
  ('navigation_pitch', '45')
ON CONFLICT (config_key) DO NOTHING;
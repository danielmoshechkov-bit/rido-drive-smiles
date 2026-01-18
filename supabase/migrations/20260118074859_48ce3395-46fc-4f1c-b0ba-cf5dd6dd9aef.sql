-- Create maps_config table for storing map configuration
CREATE TABLE IF NOT EXISTS public.maps_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key VARCHAR(50) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default values
INSERT INTO public.maps_config (config_key, config_value) VALUES
  ('style_url', 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'),
  ('default_center_lat', '52.2297'),
  ('default_center_lng', '21.0122'),
  ('default_zoom', '11.5')
ON CONFLICT (config_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.maps_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read maps config
CREATE POLICY "Anyone can read maps_config"
  ON public.maps_config FOR SELECT USING (true);

-- Only admins can update maps config (using user_roles)
CREATE POLICY "Admins can update maps_config"
  ON public.maps_config FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can insert maps config
CREATE POLICY "Admins can insert maps_config"
  ON public.maps_config FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
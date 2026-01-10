-- Create location_integrations table for managing external service integrations
CREATE TABLE public.location_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_type TEXT NOT NULL,
  provider TEXT,
  is_enabled BOOLEAN DEFAULT false,
  api_key_secret_name TEXT,
  visible_in_listings BOOLEAN DEFAULT true,
  visible_in_search BOOLEAN DEFAULT true,
  visible_in_map BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_type)
);

-- Enable RLS
ALTER TABLE public.location_integrations ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access only
CREATE POLICY "Only admins can view location integrations"
ON public.location_integrations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

CREATE POLICY "Only admins can insert location integrations"
ON public.location_integrations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

CREATE POLICY "Only admins can update location integrations"
ON public.location_integrations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_location_integrations_updated_at
BEFORE UPDATE ON public.location_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default integration types
INSERT INTO public.location_integrations (integration_type, provider, is_enabled) VALUES
  ('maps', 'google_maps', false),
  ('air_quality', 'airly', false),
  ('public_transport', 'gtfs', false),
  ('traffic', 'here', false),
  ('poi', 'openstreetmap', false);
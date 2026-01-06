-- Create table for global feature toggles (admin controls visibility of features across all accounts)
CREATE TABLE IF NOT EXISTS public.feature_toggles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) UNIQUE NOT NULL,
  feature_name VARCHAR(255) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

-- Anyone can read feature toggles
CREATE POLICY "Anyone can read feature toggles"
ON public.feature_toggles
FOR SELECT
USING (true);

-- Only admins can update feature toggles
CREATE POLICY "Admins can update feature toggles"
ON public.feature_toggles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert feature toggles
CREATE POLICY "Admins can insert feature toggles"
ON public.feature_toggles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert default feature toggles
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled) VALUES
  ('marketplace_enabled', 'Giełda aut', 'Włącza/wyłącza widoczność giełdy aut na wszystkich kontach', false),
  ('fleet_registration_enabled', 'Rejestracja flot', 'Pozwala użytkownikom rejestrować nowe floty', false)
ON CONFLICT (feature_key) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_feature_toggles_updated_at
  BEFORE UPDATE ON public.feature_toggles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
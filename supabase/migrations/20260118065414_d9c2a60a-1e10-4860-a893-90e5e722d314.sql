-- Create module_visibility table for managing module visibility settings
CREATE TABLE public.module_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key VARCHAR(50) NOT NULL UNIQUE,
  module_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  visible_to_roles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.module_visibility ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read module visibility (needed for checking access)
CREATE POLICY "Anyone can read module visibility"
ON public.module_visibility
FOR SELECT
USING (true);

-- Only admins can update module visibility
CREATE POLICY "Admins can update module visibility"
ON public.module_visibility
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert module visibility
CREATE POLICY "Admins can insert module visibility"
ON public.module_visibility
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_module_visibility_updated_at
BEFORE UPDATE ON public.module_visibility
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial record for maps module
INSERT INTO public.module_visibility (module_key, module_name, is_active, visible_to_roles)
VALUES ('maps', 'Mapy', false, '{}');
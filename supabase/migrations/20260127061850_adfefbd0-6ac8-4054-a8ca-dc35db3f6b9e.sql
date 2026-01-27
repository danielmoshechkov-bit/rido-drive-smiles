-- Add DELETE policy for fleet_settlement role on settlements table
CREATE POLICY "Fleet settlement can delete settlements for their drivers"
ON public.settlements
FOR DELETE
USING (
  public.has_role(auth.uid(), 'fleet_settlement'::app_role) 
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = settlements.driver_id 
    AND d.fleet_id = public.get_user_fleet_id(auth.uid())
  )
);

-- Create UI settings table
CREATE TABLE public.ui_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ui_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read UI settings (they are public)
CREATE POLICY "Anyone can read UI settings"
ON public.ui_settings FOR SELECT
USING (true);

-- Only admins can update UI settings
CREATE POLICY "Admins can manage UI settings"
ON public.ui_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert default nav bar color setting
INSERT INTO public.ui_settings (key, value)
VALUES ('nav_bar_color', '{"type": "preset", "preset": "purple", "custom": "#6C3CF0"}'::jsonb);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_ui_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_ui_settings_updated_at
BEFORE UPDATE ON public.ui_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_ui_settings_updated_at();
-- Create table for RIDO settings
CREATE TABLE IF NOT EXISTS public.rido_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for RIDO settlements
CREATE TABLE IF NOT EXISTS public.rido_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_from date NOT NULL,
  period_to date NOT NULL,
  status text NOT NULL DEFAULT 'nowe',
  sheet_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rido_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rido_settlements ENABLE ROW LEVEL SECURITY;

-- Create policies for admins
CREATE POLICY "Admins can manage rido settings"
  ON public.rido_settings
  FOR ALL
  USING (true);

CREATE POLICY "Admins can manage rido settlements"
  ON public.rido_settlements
  FOR ALL
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_rido_settings_updated_at
  BEFORE UPDATE ON public.rido_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rido_settlements_updated_at
  BEFORE UPDATE ON public.rido_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.rido_settings (key, value)
VALUES ('rido_settings_env', '{
  "active": "test",
  "test": {
    "script_url": "https://script.google.com/macros/s/AKfycbw8maRlYQrsSKhdZ9rq4spr80lcCrMY_fb3Nb1rgNLXA6uXAL1p8Ha3wKnw_hP8Dfk/exec",
    "secret": "RIDO2025SUPER",
    "sheet_url": "https://docs.google.com/spreadsheets/d/1gzBs58BH7c3bzY4l6WnDMOBRvjK3T1brF9ZYdIx5WRc/edit?usp=sharing&rm=minimal",
    "use_base64": true
  },
  "prod": {
    "script_url": "",
    "secret": "",
    "sheet_url": "",
    "use_base64": true
  }
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
-- Table for system alerts (errors, warnings, new drivers)
CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('error', 'warning', 'new_driver', 'info')),
  category text NOT NULL CHECK (category IN ('import', 'matching', 'validation', 'system')),
  title text NOT NULL,
  description text,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by uuid
);

-- Table for manual driver matches (learning system)
CREATE TABLE IF NOT EXISTS public.manual_driver_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  match_key text NOT NULL, -- e.g., "email:test@test.com" or "name:Jan Kowalski"
  match_value text NOT NULL,
  platform text, -- uber, bolt, freenow
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(match_key, match_value, platform)
);

-- Table for import history
CREATE TABLE IF NOT EXISTS public.import_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  filename text NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  successful_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  new_drivers_count integer NOT NULL DEFAULT 0,
  matched_drivers_count integer NOT NULL DEFAULT 0,
  is_first_import boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Table for admin communication settings
CREATE TABLE IF NOT EXISTS public.admin_communication_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sms_gateway_enabled boolean DEFAULT false,
  sms_api_url text,
  sms_api_key_name text, -- reference to secret name
  email_enabled boolean DEFAULT false,
  email_provider text CHECK (email_provider IN ('resend', 'smtp', 'sendgrid')),
  email_from_address text,
  email_from_name text,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password_name text, -- reference to secret name
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Table for driver communications log
CREATE TABLE IF NOT EXISTS public.driver_communications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('email', 'sms', 'invitation')),
  subject text,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON public.system_alerts(status);
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON public.system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_driver_id ON public.system_alerts(driver_id);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at ON public.system_alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_manual_driver_matches_driver_id ON public.manual_driver_matches(driver_id);
CREATE INDEX IF NOT EXISTS idx_manual_driver_matches_key_value ON public.manual_driver_matches(match_key, match_value);

CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON public.import_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_period ON public.import_history(period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_driver_communications_driver_id ON public.driver_communications(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_communications_status ON public.driver_communications(status);
CREATE INDEX IF NOT EXISTS idx_driver_communications_created_at ON public.driver_communications(created_at DESC);

-- Enable RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_driver_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_communications ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin only)
CREATE POLICY "Admins can manage system alerts"
  ON public.system_alerts
  FOR ALL
  USING (true);

CREATE POLICY "Admins can manage manual matches"
  ON public.manual_driver_matches
  FOR ALL
  USING (true);

CREATE POLICY "Admins can view import history"
  ON public.import_history
  FOR ALL
  USING (true);

CREATE POLICY "Admins can manage communication settings"
  ON public.admin_communication_settings
  FOR ALL
  USING (true);

CREATE POLICY "Admins can manage driver communications"
  ON public.driver_communications
  FOR ALL
  USING (true);

-- Trigger for updating updated_at
CREATE TRIGGER update_admin_communication_settings_updated_at
  BEFORE UPDATE ON public.admin_communication_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default communication settings
INSERT INTO public.admin_communication_settings (
  sms_gateway_enabled,
  email_enabled,
  email_provider,
  email_from_name
) VALUES (
  false,
  false,
  'resend',
  'RIDO System'
) ON CONFLICT DO NOTHING;
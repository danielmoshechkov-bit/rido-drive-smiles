
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text DEFAULT 'CAR4RIDE',
  nip text,
  regon text,
  street text,
  building_number text,
  apartment_number text,
  postal_code text,
  city text,
  country text DEFAULT 'Polska',
  email text,
  phone text,
  bank_name text,
  bank_account text,
  ksef_token text,
  ksef_environment text DEFAULT 'test' CHECK (ksef_environment IN ('test', 'production')),
  ksef_status text DEFAULT 'not_configured' CHECK (ksef_status IN ('not_configured', 'connected', 'error')),
  ksef_last_test_at timestamptz,
  ksef_last_test_result text,
  invoice_vat_rate numeric DEFAULT 23,
  invoice_prefix text DEFAULT 'FV',
  invoice_currency text DEFAULT 'PLN',
  invoice_payment_days integer DEFAULT 14,
  invoice_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage company_settings" ON public.company_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.ksef_monitor_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'warning')),
  source text,
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  checked_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.ksef_monitor_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ksef_monitor_log" ON public.ksef_monitor_log
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

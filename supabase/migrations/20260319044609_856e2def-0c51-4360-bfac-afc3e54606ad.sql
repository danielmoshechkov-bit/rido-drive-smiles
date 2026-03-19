-- 1. Global vehicle registry cache
CREATE TABLE IF NOT EXISTS vehicle_registry_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text,
  vin text,
  make text,
  model text,
  body_style text,
  color text,
  registration_year integer,
  manufacture_year_from integer,
  manufacture_year_to integer,
  fuel_type text,
  engine_size text,
  transmission text,
  number_of_doors text,
  number_of_seats text,
  description text,
  source text DEFAULT 'external_api',
  source_payload jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_vrc_reg ON vehicle_registry_cache (UPPER(registration_number));
CREATE INDEX idx_vrc_vin ON vehicle_registry_cache (UPPER(vin));

-- 2. Vehicle lookup credits per user
CREATE TABLE IF NOT EXISTS vehicle_lookup_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  total_credits_purchased integer DEFAULT 0,
  remaining_credits integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Credit transactions history
CREATE TABLE IF NOT EXISTS vehicle_lookup_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('purchase','usage','manual_add','manual_remove')),
  credits integer NOT NULL,
  price_net numeric(10,2),
  source text DEFAULT 'system' CHECK (source IN ('payment','admin','system')),
  note text,
  created_at timestamptz DEFAULT now(),
  created_by_admin_id uuid
);

-- 4. Vehicle lookup usage log
CREATE TABLE IF NOT EXISTS vehicle_lookup_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  registration_number text,
  vin text,
  source_type text NOT NULL CHECK (source_type IN ('cache','external_api','cache_vin')),
  credits_used integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- 5. Portal integrations config
CREATE TABLE IF NOT EXISTS portal_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  provider text,
  is_enabled boolean DEFAULT false,
  config_json jsonb DEFAULT '{}',
  last_test_status text,
  last_test_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO portal_integrations (key, name, provider, is_enabled, config_json)
VALUES ('regcheck_poland', 'RegCheck Poland', 'regcheck', false, '{"endpoint_url":"https://www.regcheck.org.uk/api/reg.asmx/CheckPoland","username":"","test_mode":false}')
ON CONFLICT (key) DO NOTHING;

-- 6. Vehicle integration logs
CREATE TABLE IF NOT EXISTS vehicle_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text,
  user_id uuid,
  registration_number text,
  vin text,
  request_type text CHECK (request_type IN ('registration','vin')),
  status text,
  response_snapshot jsonb,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 7. Payment gateway config
CREATE TABLE IF NOT EXISTS payment_gateway_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider text NOT NULL,
  is_enabled boolean DEFAULT false,
  is_test_mode boolean DEFAULT true,
  merchant_id text,
  api_key_secret_name text,
  webhook_url text,
  config_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE vehicle_registry_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_lookup_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_lookup_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_lookup_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_integration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_gateway_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vehicle cache" ON vehicle_registry_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service can insert vehicle cache" ON vehicle_registry_cache FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users see own credits" ON vehicle_lookup_credits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own credits" ON vehicle_lookup_credits FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own credits" ON vehicle_lookup_credits FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage all credits" ON vehicle_lookup_credits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own credit transactions" ON vehicle_lookup_credit_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert own credit transactions" ON vehicle_lookup_credit_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all credit transactions" ON vehicle_lookup_credit_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own usage" ON vehicle_lookup_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert own usage" ON vehicle_lookup_usage FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins see all usage" ON vehicle_lookup_usage FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage integrations" ON portal_integrations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins see integration logs" ON vehicle_integration_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert integration logs" ON vehicle_integration_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins manage payment config" ON payment_gateway_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
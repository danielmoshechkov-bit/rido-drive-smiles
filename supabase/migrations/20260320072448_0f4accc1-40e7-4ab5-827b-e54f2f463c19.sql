
-- User's own service price history for autocomplete
CREATE TABLE IF NOT EXISTS public.service_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  service_name_normalized text NOT NULL,
  last_price_net numeric NOT NULL DEFAULT 0,
  last_price_gross numeric NOT NULL DEFAULT 0,
  usage_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, service_name_normalized)
);

ALTER TABLE public.service_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own service prices"
  ON public.service_price_history FOR ALL
  TO authenticated
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())))
  WITH CHECK (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

-- Anonymous aggregated prices for community suggestions
CREATE TABLE IF NOT EXISTS public.anonymous_service_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name_normalized text NOT NULL,
  vehicle_brand text,
  vehicle_model text,
  engine_capacity integer,
  city text,
  voivodeship text,
  industry text DEFAULT 'warsztat',
  price_net numeric NOT NULL,
  price_gross numeric NOT NULL,
  created_month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anonymous_service_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read anon prices"
  ON public.anonymous_service_prices FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can insert anon prices"
  ON public.anonymous_service_prices FOR INSERT
  TO authenticated WITH CHECK (true);

-- Rido Price settings per provider
CREATE TABLE IF NOT EXISTS public.rido_price_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE UNIQUE,
  ai_suggestions_enabled boolean NOT NULL DEFAULT true,
  share_anonymous_data boolean NOT NULL DEFAULT true,
  industry text NOT NULL DEFAULT 'warsztat',
  default_parts_margin numeric NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rido_price_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own rido price settings"
  ON public.rido_price_settings FOR ALL
  TO authenticated
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())))
  WITH CHECK (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

CREATE INDEX idx_service_price_history_search ON public.service_price_history(provider_id, service_name_normalized);
CREATE INDEX idx_anonymous_service_prices_search ON public.anonymous_service_prices(service_name_normalized, vehicle_brand, city);

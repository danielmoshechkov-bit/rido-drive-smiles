-- VIN caching for Inter Cars VIN-first parts lookup flow
--
-- Two tables:
-- 1) vehicle_vin_cache — per (vin, provider_id) decoded vehicle info from IC catalog (15 day TTL)
-- 2) ic_vin_endpoint_cache — per provider, discovered IC API endpoint template that works for VIN decoding
--    (IC API docs are behind partner login — we probe candidate URLs at runtime and remember the one that works)

CREATE TABLE IF NOT EXISTS public.vehicle_vin_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin           text NOT NULL,
  provider_id   uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  ic_car_id     text,
  vehicle_info  jsonb,
  endpoint_used text,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '15 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vin, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_vin_cache_lookup
  ON public.vehicle_vin_cache (vin, provider_id);

ALTER TABLE public.vehicle_vin_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own vin cache" ON public.vehicle_vin_cache;
CREATE POLICY "Providers manage own vin cache"
  ON public.vehicle_vin_cache
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));


CREATE TABLE IF NOT EXISTS public.ic_vin_endpoint_cache (
  provider_id            uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  endpoint_method        text NOT NULL,           -- 'GET' or 'POST'
  endpoint_template      text NOT NULL,           -- path with {VIN} placeholder, e.g. '/ic/catalog/vehicles?vin={VIN}'
  endpoint_body_template text,                    -- for POST: JSON template with {VIN} placeholder, NULL for GET
  car_id_path            text,                    -- jsonpath hint where carId was extracted from (reserved for future)
  vehicle_info_path      text,                    -- jsonpath hint for vehicleInfo (reserved for future)
  discovered_at          timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ic_vin_endpoint_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own ic vin endpoint cache" ON public.ic_vin_endpoint_cache;
CREATE POLICY "Providers manage own ic vin endpoint cache"
  ON public.ic_vin_endpoint_cache
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

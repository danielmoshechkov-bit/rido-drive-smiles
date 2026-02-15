
-- Workshop order signatures (client document signing)
CREATE TABLE public.workshop_order_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'reception_protocol', 'cost_estimate', 'release_protocol'
  signed_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  fingerprint TEXT,
  signature_method TEXT DEFAULT 'button', -- 'button' or 'canvas'
  signature_data TEXT, -- canvas signature base64 if used
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workshop_order_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workshop signatures viewable by provider" ON public.workshop_order_signatures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workshop_orders wo WHERE wo.id = order_id AND wo.provider_id IN (
      SELECT sp.id FROM service_providers sp WHERE sp.user_id = auth.uid()
    ))
  );
CREATE POLICY "Workshop signatures insertable by anyone with code" ON public.workshop_order_signatures
  FOR INSERT WITH CHECK (true);

-- Add client_code to workshop_orders for public access
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS client_code TEXT;
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS client_acceptance_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS quote_accepted BOOLEAN DEFAULT false;
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS ready_notification_sent BOOLEAN DEFAULT false;
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS sms_sent_count INT DEFAULT 0;
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS last_sms_sent_at TIMESTAMPTZ;

-- Auto-generate client code on insert
CREATE OR REPLACE TRIGGER trg_workshop_client_code
  BEFORE INSERT ON public.workshop_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_client_confirmation_code();

-- Workshop workstations
CREATE TABLE public.workshop_workstations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workshop_workstations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workstations by provider" ON public.workshop_workstations
  FOR ALL USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Workshop mechanics/workers
CREATE TABLE public.workshop_mechanics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,
  specialization TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workshop_mechanics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mechanics by provider" ON public.workshop_mechanics
  FOR ALL USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Add workstation/mechanic to orders
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS workstation_id UUID REFERENCES public.workshop_workstations(id);
ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.workshop_mechanics(id);

-- Tire storage / Przechowalnia
CREATE TABLE public.workshop_tire_storage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.workshop_clients(id),
  vehicle_id UUID REFERENCES public.workshop_vehicles(id),
  storage_number TEXT, -- warehouse location number
  tire_brand TEXT,
  tire_model TEXT,
  tire_size TEXT, -- e.g. 205/55R16
  tire_type TEXT, -- 'summer', 'winter', 'all_season'
  quantity INT DEFAULT 4,
  tread_depth_mm NUMERIC,
  production_year INT,
  dot_code TEXT,
  condition TEXT, -- 'good', 'fair', 'replace'
  notes TEXT,
  photo_urls TEXT[],
  stored_at TIMESTAMPTZ DEFAULT now(),
  pickup_at TIMESTAMPTZ,
  season TEXT, -- 'winter_2025', 'summer_2026' etc
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workshop_tire_storage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tire storage by provider" ON public.workshop_tire_storage
  FOR ALL USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Allow public read of orders by client_code (for client panel)
CREATE POLICY "Public read orders by client_code" ON public.workshop_orders
  FOR SELECT USING (client_code IS NOT NULL);

-- Allow public read of order items for client view
CREATE POLICY "Public read order items" ON public.workshop_order_items
  FOR SELECT USING (true);

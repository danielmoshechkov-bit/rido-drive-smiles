
-- =============================================
-- MODUŁ WARSZTAT / ZLECENIA (Workshop Orders)
-- =============================================

-- Klienci warsztatu (osoby prywatne i firmy)
CREATE TABLE public.workshop_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  client_type TEXT NOT NULL DEFAULT 'individual' CHECK (client_type IN ('individual', 'company')),
  company_name TEXT,
  nip TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  postal_code TEXT,
  city TEXT,
  street TEXT,
  country TEXT DEFAULT 'Polska',
  default_vehicle_id UUID,
  payment_method TEXT,
  payment_term TEXT,
  service_discount_percent NUMERIC DEFAULT 0,
  product_discount_percent NUMERIC DEFAULT 0,
  description TEXT,
  marketing_consent BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage own clients"
  ON public.workshop_clients FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Pojazdy warsztatu
CREATE TABLE public.workshop_vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  owner_client_id UUID REFERENCES public.workshop_clients(id),
  brand TEXT,
  model TEXT,
  color TEXT,
  vin TEXT,
  plate TEXT,
  year INT,
  first_registration_date DATE,
  fuel_type TEXT,
  engine_number TEXT,
  engine_capacity_cm3 INT,
  engine_power_kw INT,
  mileage_unit TEXT DEFAULT 'km',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage own vehicles"
  ON public.workshop_vehicles FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Aktualizacja FK default_vehicle_id
ALTER TABLE public.workshop_clients 
  ADD CONSTRAINT workshop_clients_default_vehicle_fk 
  FOREIGN KEY (default_vehicle_id) REFERENCES public.workshop_vehicles(id);

-- Statusy zleceń (konfigurowalne per usługodawca)
CREATE TABLE public.workshop_order_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#f59e0b',
  sort_order INT DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  sends_sms BOOLEAN DEFAULT false,
  sms_template TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_order_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage own statuses"
  ON public.workshop_order_statuses FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Zlecenia
CREATE TABLE public.workshop_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  vehicle_id UUID REFERENCES public.workshop_vehicles(id),
  client_id UUID REFERENCES public.workshop_clients(id),
  status_id UUID REFERENCES public.workshop_order_statuses(id),
  status_name TEXT DEFAULT 'Nowe zlecenie',
  description TEXT,
  acceptance_date TIMESTAMPTZ,
  total_net NUMERIC DEFAULT 0,
  total_gross NUMERIC DEFAULT 0,
  price_mode TEXT DEFAULT 'gross' CHECK (price_mode IN ('net', 'gross')),
  return_parts_to_client BOOLEAN DEFAULT false,
  registration_document BOOLEAN DEFAULT false,
  test_drive_consent BOOLEAN DEFAULT true,
  top_up_fluids BOOLEAN DEFAULT false,
  top_up_lights BOOLEAN DEFAULT false,
  internal_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage own orders"
  ON public.workshop_orders FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Generowanie numeru zlecenia
CREATE SEQUENCE IF NOT EXISTS workshop_order_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_workshop_order_number()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'ZL ' || nextval('workshop_order_seq')::text || '/' || 
      LPAD(EXTRACT(MONTH FROM now())::text, 2, '0') || '/' || 
      EXTRACT(YEAR FROM now())::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workshop_order_number
  BEFORE INSERT ON public.workshop_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_workshop_order_number();

-- Pozycje zlecenia (zadania/usługi/części)
CREATE TABLE public.workshop_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mechanic TEXT,
  unit TEXT DEFAULT 'szt',
  quantity NUMERIC DEFAULT 1,
  unit_price_net NUMERIC DEFAULT 0,
  unit_price_gross NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  total_net NUMERIC DEFAULT 0,
  total_gross NUMERIC DEFAULT 0,
  item_type TEXT DEFAULT 'service' CHECK (item_type IN ('service', 'part', 'other')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage order items via order"
  ON public.workshop_order_items FOR ALL
  USING (order_id IN (SELECT id FROM workshop_orders WHERE provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())));

-- Historia statusów
CREATE TABLE public.workshop_order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  sms_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can view status history"
  ON public.workshop_order_status_history FOR ALL
  USING (order_id IN (SELECT id FROM workshop_orders WHERE provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())));

-- Trigger updated_at
CREATE TRIGGER trg_workshop_orders_updated
  BEFORE UPDATE ON public.workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_workshop_clients_updated
  BEFORE UPDATE ON public.workshop_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_workshop_vehicles_updated
  BEFORE UPDATE ON public.workshop_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wstawienie domyślnych statusów (funkcja do wywołania per provider)
CREATE OR REPLACE FUNCTION public.init_workshop_default_statuses(p_provider_id UUID)
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order, is_default, sends_sms) VALUES
    (p_provider_id, 'Przyjęcie do serwisu', '#ef4444', 0, true, false),
    (p_provider_id, 'Nowe zlecenie', '#f59e0b', 1, false, false),
    (p_provider_id, 'Akceptacja klienta', '#f59e0b', 2, false, true),
    (p_provider_id, 'W trakcie naprawy', '#f59e0b', 3, false, false),
    (p_provider_id, 'Zadania wykonane', '#22c55e', 4, false, false),
    (p_provider_id, 'Gotowy do odbioru', '#22c55e', 5, false, true),
    (p_provider_id, 'Zakończone', '#1f2937', 6, false, false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Indeksy
CREATE INDEX idx_workshop_orders_provider ON public.workshop_orders(provider_id);
CREATE INDEX idx_workshop_orders_status ON public.workshop_orders(status_name);
CREATE INDEX idx_workshop_orders_client ON public.workshop_orders(client_id);
CREATE INDEX idx_workshop_orders_vehicle ON public.workshop_orders(vehicle_id);
CREATE INDEX idx_workshop_clients_provider ON public.workshop_clients(provider_id);
CREATE INDEX idx_workshop_vehicles_provider ON public.workshop_vehicles(provider_id);
CREATE INDEX idx_workshop_order_items_order ON public.workshop_order_items(order_id);

-- Admin ma też dostęp (do podglądu)
CREATE POLICY "Admin full access workshop_orders"
  ON public.workshop_orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin full access workshop_clients"
  ON public.workshop_clients FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin full access workshop_vehicles"
  ON public.workshop_vehicles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin full access workshop_order_statuses"
  ON public.workshop_order_statuses FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin full access workshop_order_items"
  ON public.workshop_order_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin full access workshop_order_status_history"
  ON public.workshop_order_status_history FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

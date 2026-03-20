
-- Workshop parts integrations (API credentials per provider)
CREATE TABLE public.workshop_parts_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL, -- 'hart', 'auto_partner', etc.
  api_username TEXT,
  api_password TEXT,
  default_branch_id TEXT,
  sales_margin_percent NUMERIC NOT NULL DEFAULT 30,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'sandbox', -- 'sandbox' or 'production'
  last_connection_status TEXT, -- 'ok' or 'error'
  last_connection_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, supplier_code)
);

ALTER TABLE public.workshop_parts_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own integrations"
  ON public.workshop_parts_integrations
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- Workshop parts orders
CREATE TABLE public.workshop_parts_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.workshop_orders(id) ON DELETE SET NULL,
  supplier_code TEXT NOT NULL,
  supplier_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'ordered', -- ordered, in_delivery, delivered, cancelled
  total_net NUMERIC NOT NULL DEFAULT 0,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  invoice_number TEXT,
  invoice_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_parts_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own parts orders"
  ON public.workshop_parts_orders
  FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- Workshop parts order items
CREATE TABLE public.workshop_parts_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parts_order_id UUID NOT NULL REFERENCES public.workshop_parts_orders(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  manufacturer TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  purchase_price_net NUMERIC NOT NULL DEFAULT 0,
  selling_price_gross NUMERIC NOT NULL DEFAULT 0,
  availability TEXT, -- 'today', 'tomorrow', '2-3days', 'unavailable'
  delivery_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_parts_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own parts order items"
  ON public.workshop_parts_order_items
  FOR ALL TO authenticated
  USING (parts_order_id IN (
    SELECT id FROM public.workshop_parts_orders 
    WHERE provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  ))
  WITH CHECK (parts_order_id IN (
    SELECT id FROM public.workshop_parts_orders 
    WHERE provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  ));

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_workshop_parts_integrations
  BEFORE UPDATE ON public.workshop_parts_integrations
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_workshop_parts_orders
  BEFORE UPDATE ON public.workshop_parts_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

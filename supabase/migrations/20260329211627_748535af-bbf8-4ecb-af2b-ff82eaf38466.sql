
CREATE TABLE IF NOT EXISTS provider_ad_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES provider_services(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  ad_type TEXT DEFAULT 'standard',
  budget NUMERIC DEFAULT 0,
  duration_days INT DEFAULT 30,
  target_city TEXT,
  ad_title TEXT,
  ad_description TEXT,
  ad_image_url TEXT,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  leads_count INT DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  service_id UUID REFERENCES provider_services(id) ON DELETE SET NULL,
  ad_order_id UUID REFERENCES provider_ad_orders(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'organic',
  lead_name TEXT,
  lead_phone TEXT,
  lead_email TEXT,
  lead_message TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_email TEXT,
  notify_new_orders BOOLEAN DEFAULT true,
  notify_status_changes BOOLEAN DEFAULT true,
  notify_new_leads BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE provider_ad_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider own ads" ON provider_ad_orders FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Provider own leads" ON service_leads FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

CREATE POLICY "Admin manages ads" ON provider_ad_orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages leads" ON service_leads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin manages notification settings" ON marketing_notification_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

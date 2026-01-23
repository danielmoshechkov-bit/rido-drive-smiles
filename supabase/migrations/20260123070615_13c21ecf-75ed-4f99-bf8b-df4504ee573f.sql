-- Sprint 9: Rental Payment Reminders
CREATE TABLE IF NOT EXISTS public.rental_payment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  amount_due NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reminded', 'overdue', 'paid')),
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  last_reminder_type TEXT,
  payment_confirmed_at TIMESTAMPTZ,
  payment_confirmed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for rental_payment_reminders
ALTER TABLE public.rental_payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet managers can manage their payment reminders"
  ON public.rental_payment_reminders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.fleet_id = rental_payment_reminders.fleet_id
      AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  );

CREATE POLICY "Drivers can view their own payment reminders"
  ON public.rental_payment_reminders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.driver_app_users dau
      WHERE dau.user_id = auth.uid()
      AND dau.driver_id = rental_payment_reminders.driver_id
    )
  );

-- Sprint 9: SMS templates per fleet
CREATE TABLE IF NOT EXISTS public.fleet_sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL DEFAULT 'payment_reminder',
  template_content TEXT NOT NULL DEFAULT 'Przypomnienie: Termin płatności za wynajem pojazdu minął. Kwota: {amount} PLN. Prosimy o pilną wpłatę.',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fleet_id, template_type)
);

ALTER TABLE public.fleet_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet managers can manage their SMS templates"
  ON public.fleet_sms_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.fleet_id = fleet_sms_templates.fleet_id
      AND ur.role IN ('fleet_settlement', 'fleet_rental')
    )
  );

-- Sprint 11: KSeF integration tables
CREATE TABLE IF NOT EXISTS public.ksef_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'demo' CHECK (environment IN ('demo', 'production')),
  token_encrypted TEXT,
  nip TEXT,
  auto_send BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ksef_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity owners can manage KSeF settings"
  ON public.ksef_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = ksef_settings.entity_id
      AND e.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Accounting admins can manage KSeF settings"
  ON public.ksef_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'accounting_admin'
    )
  );

-- KSeF transmission log
CREATE TABLE IF NOT EXISTS public.ksef_transmissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outgoing' CHECK (direction IN ('outgoing', 'incoming')),
  ksef_reference_number TEXT,
  upo_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'rejected', 'error')),
  error_message TEXT,
  xml_content TEXT,
  sent_at TIMESTAMPTZ,
  response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ksef_transmissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity owners can view their KSeF transmissions"
  ON public.ksef_transmissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = ksef_transmissions.entity_id
      AND e.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Accounting admins can manage KSeF transmissions"
  ON public.ksef_transmissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'accounting_admin'
    )
  );

-- Sprint 12: Tax categories for KPiR/Ryczałt
CREATE TABLE IF NOT EXISTS public.tax_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  kpir_column INTEGER,
  ryczalt_rate NUMERIC,
  vat_deductible_percent INTEGER DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default tax categories
INSERT INTO public.tax_categories (code, name, description, kpir_column, ryczalt_rate, vat_deductible_percent) VALUES
  ('FUEL', 'Paliwo', 'Koszty paliwa do pojazdów', 13, NULL, 50),
  ('CAR_LEASE', 'Leasing samochodu', 'Raty leasingowe pojazdu', 13, NULL, 50),
  ('CAR_INSURANCE', 'Ubezpieczenie pojazdu', 'OC/AC/NNW', 13, NULL, 50),
  ('CAR_SERVICE', 'Serwis pojazdu', 'Naprawy i przeglądy', 13, NULL, 50),
  ('OFFICE', 'Materiały biurowe', 'Materiały biurowe i eksploatacyjne', 13, NULL, 100),
  ('TELECOM', 'Telekomunikacja', 'Telefon, internet', 13, NULL, 100),
  ('SOFTWARE', 'Oprogramowanie', 'Licencje i subskrypcje', 13, NULL, 100),
  ('RENT', 'Wynajem lokalu', 'Czynsz za lokal biurowy', 13, NULL, 100),
  ('SALARY', 'Wynagrodzenia', 'Wynagrodzenia pracowników', 12, NULL, 100),
  ('ZUS', 'Składki ZUS', 'Składki społeczne i zdrowotne', 13, NULL, 100),
  ('BANK', 'Opłaty bankowe', 'Prowizje i opłaty bankowe', 13, NULL, 100),
  ('MARKETING', 'Marketing', 'Reklama i promocja', 13, NULL, 100),
  ('TRAINING', 'Szkolenia', 'Szkolenia i kursy', 13, NULL, 100),
  ('OTHER', 'Inne koszty', 'Pozostałe koszty działalności', 13, NULL, 100),
  ('REVENUE_TRANSPORT', 'Przychód - transport', 'Usługi transportowe', 7, 5.5, 100),
  ('REVENUE_SERVICE', 'Przychód - usługi', 'Usługi pozostałe', 7, 8.5, 100),
  ('REVENUE_TRADE', 'Przychód - handel', 'Sprzedaż towarów', 7, 3.0, 100)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tax categories"
  ON public.tax_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Add tax_category_id to document_inbox
ALTER TABLE public.document_inbox 
ADD COLUMN IF NOT EXISTS tax_category_id UUID REFERENCES public.tax_categories(id),
ADD COLUMN IF NOT EXISTS ai_tax_advice TEXT;

-- Add tax_category_id to accounting_entries
ALTER TABLE public.accounting_entries
ADD COLUMN IF NOT EXISTS tax_category_id UUID REFERENCES public.tax_categories(id);

-- Sprint 10: Storage bucket for entity logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('entity-logos', 'entity-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for entity logos
CREATE POLICY "Users can upload their entity logos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'entity-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view entity logos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'entity-logos');

CREATE POLICY "Users can update their entity logos"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'entity-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their entity logos"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'entity-logos' AND auth.uid() IS NOT NULL);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_rental_payment_reminders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_rental_payment_reminders_updated_at
  BEFORE UPDATE ON public.rental_payment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_rental_payment_reminders_updated_at();

CREATE OR REPLACE FUNCTION public.update_ksef_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_ksef_settings_updated_at
  BEFORE UPDATE ON public.ksef_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_ksef_settings_updated_at();
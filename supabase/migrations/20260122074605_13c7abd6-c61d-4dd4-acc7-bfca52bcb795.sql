-- =============================================
-- SPRINT 1: MODUŁ FINANSOWO-KSIĘGOWY - FUNDAMENT
-- =============================================

-- 1. Rozszerzenie app_role o nową rolę accounting_admin
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'accounting_admin';

-- 2. Tabela entities (firmy/podmioty)
CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('jdg', 'sp_zoo', 'sp_jawna', 'sp_komandytowa', 'sp_komandytowo_akcyjna', 'sp_akcyjna', 'fundacja', 'stowarzyszenie', 'other')),
  name TEXT NOT NULL,
  short_name TEXT,
  nip TEXT,
  regon TEXT,
  krs TEXT,
  vat_payer BOOLEAN DEFAULT true,
  address_street TEXT,
  address_city TEXT,
  address_postal_code TEXT,
  address_country TEXT DEFAULT 'Polska',
  bank_name TEXT,
  bank_account TEXT,
  email TEXT,
  phone TEXT,
  email_for_invoices TEXT,
  default_currency TEXT DEFAULT 'PLN',
  logo_url TEXT,
  owner_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela accounting_assignments (przypisania księgowej do firm)
CREATE TABLE IF NOT EXISTS public.accounting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accounting_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  role_scope TEXT NOT NULL CHECK (role_scope IN ('read', 'write', 'approve')) DEFAULT 'read',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(accounting_user_id, entity_id)
);

-- 4. Tabela invoice_recipients (kontrahenci)
CREATE TABLE IF NOT EXISTS public.invoice_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nip TEXT,
  address_street TEXT,
  address_city TEXT,
  address_postal_code TEXT,
  address_country TEXT DEFAULT 'Polska',
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela invoice_series (serie numeracji faktur)
CREATE TABLE IF NOT EXISTS public.invoice_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT 'FV/',
  pattern TEXT NOT NULL DEFAULT '{PREFIX}{YYYY}/{MM}/{SEQ}',
  sequence_current INTEGER DEFAULT 0,
  reset_rule TEXT CHECK (reset_rule IN ('monthly', 'yearly', 'never')) DEFAULT 'monthly',
  is_default BOOLEAN DEFAULT false,
  invoice_type TEXT CHECK (invoice_type IN ('invoice', 'proforma', 'correction', 'receipt')) DEFAULT 'invoice',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_id, name)
);

-- 6. Tabela invoices (faktury)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  series_id UUID REFERENCES public.invoice_series(id),
  recipient_id UUID REFERENCES public.invoice_recipients(id),
  buyer_snapshot JSONB,
  invoice_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('invoice', 'proforma', 'correction', 'credit_note', 'debit_note', 'receipt', 'advance', 'final')) DEFAULT 'invoice',
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')) DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sale_date DATE,
  due_date DATE,
  currency TEXT DEFAULT 'PLN',
  exchange_rate NUMERIC(10,4) DEFAULT 1,
  net_amount NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  gross_amount NUMERIC(12,2) DEFAULT 0,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('transfer', 'cash', 'card', 'other')) DEFAULT 'transfer',
  payment_days INTEGER DEFAULT 14,
  notes TEXT,
  internal_notes TEXT,
  pdf_url TEXT,
  correction_of_invoice_id UUID REFERENCES public.invoices(id),
  ksef_status TEXT CHECK (ksef_status IN ('not_enabled', 'queued', 'sent', 'accepted', 'rejected')) DEFAULT 'not_enabled',
  ksef_reference TEXT,
  created_by TEXT CHECK (created_by IN ('user', 'accounting_admin', 'system', 'driver_auto')) DEFAULT 'user',
  created_by_user_id UUID REFERENCES auth.users(id),
  driver_id UUID,
  settlement_id UUID,
  fleet_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Tabela invoice_items (pozycje faktur)
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  pkwiu TEXT,
  quantity NUMERIC(10,3) DEFAULT 1,
  unit TEXT DEFAULT 'szt.',
  unit_net_price NUMERIC(12,2) NOT NULL,
  vat_rate TEXT CHECK (vat_rate IN ('0', '5', '8', '23', 'zw', 'np', 'oo')) DEFAULT '23',
  net_amount NUMERIC(12,2) NOT NULL,
  vat_amount NUMERIC(12,2) NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela document_inbox (inbox dokumentów kosztowych)
CREATE TABLE IF NOT EXISTS public.document_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  source TEXT CHECK (source IN ('upload', 'email', 'api', 'ksef')) DEFAULT 'upload',
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT CHECK (file_type IN ('pdf', 'image', 'xml')) DEFAULT 'pdf',
  status TEXT CHECK (status IN ('new', 'processing', 'parsed', 'needs_review', 'booked', 'rejected')) DEFAULT 'new',
  detected_supplier JSONB,
  detected_amounts JSONB,
  ai_extraction JSONB,
  booked_entry_id UUID,
  reviewed_by_user_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Tabela accounting_entries (księgowania/dekretacja)
CREATE TABLE IF NOT EXISTS public.accounting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.document_inbox(id),
  invoice_id UUID REFERENCES public.invoices(id),
  entry_type TEXT CHECK (entry_type IN ('purchase_invoice', 'sale_invoice', 'expense', 'asset', 'payroll', 'tax', 'other')) NOT NULL,
  accounting_period TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  debit_account TEXT,
  credit_account TEXT,
  amount NUMERIC(12,2) NOT NULL,
  vat_register TEXT CHECK (vat_register IN ('purchase', 'sales', 'none')) DEFAULT 'none',
  cost_center TEXT,
  ai_suggested BOOLEAN DEFAULT false,
  approved_by_user_id UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Tabela legal_consents (zgody prawne)
CREATE TABLE IF NOT EXISTS public.legal_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'privacy_policy', 
    'terms', 
    'data_processing_rodo', 
    'b2b_auto_invoicing_authorization', 
    'self_billing_authorization', 
    'ksef_authorization',
    'accounting_service_authorization',
    'email_notifications', 
    'sms_notifications'
  )),
  version TEXT NOT NULL DEFAULT 'v1.0',
  accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  source TEXT CHECK (source IN ('web', 'mobile', 'admin')) DEFAULT 'web',
  document_snapshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entity_id, consent_type, version)
);

-- 11. Tabela audit_log (log audytowy)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  actor_type TEXT CHECK (actor_type IN ('system', 'user', 'admin', 'cron')) DEFAULT 'user',
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  entity_id UUID REFERENCES public.entities(id),
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Tabela driver_auto_invoicing_settings (ustawienia autofakturowania kierowcy)
CREATE TABLE IF NOT EXISTS public.driver_auto_invoicing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID,
  fleet_id UUID,
  enabled BOOLEAN DEFAULT false,
  frequency TEXT CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'custom')) DEFAULT 'monthly',
  custom_interval_days INTEGER,
  billing_day_of_month INTEGER CHECK (billing_day_of_month >= 1 AND billing_day_of_month <= 28) DEFAULT 1,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(driver_user_id)
);

-- 13. Tabela driver_b2b_profiles (dane firmowe kierowcy B2B)
CREATE TABLE IF NOT EXISTS public.driver_b2b_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID,
  company_name TEXT NOT NULL,
  nip TEXT NOT NULL,
  regon TEXT,
  address_street TEXT,
  address_city TEXT,
  address_postal_code TEXT,
  bank_name TEXT,
  bank_account TEXT,
  email TEXT,
  phone TEXT,
  vat_payer BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(driver_user_id)
);

-- 14. Tabela invoice_recurring_rules (faktury cykliczne)
CREATE TABLE IF NOT EXISTS public.invoice_recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.invoice_recipients(id),
  enabled BOOLEAN DEFAULT true,
  frequency TEXT CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')) DEFAULT 'monthly',
  custom_days INTEGER,
  start_date DATE NOT NULL,
  end_date DATE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  template_items JSONB NOT NULL,
  payment_days INTEGER DEFAULT 14,
  notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Tabela pricing_config (konfiguracja planów cenowych - przygotowanie)
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  plan TEXT CHECK (plan IN ('free', 'pro', 'enterprise')) DEFAULT 'free',
  free_invoices_limit INTEGER DEFAULT 3,
  show_branding_footer BOOLEAN DEFAULT true,
  pro_features_enabled BOOLEAN DEFAULT false,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS POLICIES
-- =============================================

-- Enable RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_auto_invoicing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_b2b_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Entities policies
CREATE POLICY "Users can view their own entities" ON public.entities
  FOR SELECT USING (owner_user_id = auth.uid());

CREATE POLICY "Users can insert their own entities" ON public.entities
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can update their own entities" ON public.entities
  FOR UPDATE USING (owner_user_id = auth.uid());

CREATE POLICY "Accounting admins can view assigned entities" ON public.entities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.accounting_assignments aa
      WHERE aa.entity_id = entities.id AND aa.accounting_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all entities" ON public.entities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- Accounting assignments policies
CREATE POLICY "Users can view their assignments" ON public.accounting_assignments
  FOR SELECT USING (accounting_user_id = auth.uid());

CREATE POLICY "Entity owners can manage assignments" ON public.accounting_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND e.owner_user_id = auth.uid()
    )
  );

-- Invoice recipients policies
CREATE POLICY "Users can manage recipients for their entities" ON public.invoice_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Invoice series policies
CREATE POLICY "Users can manage series for their entities" ON public.invoice_series
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Invoices policies
CREATE POLICY "Users can manage invoices for their entities" ON public.invoices
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Invoice items policies
CREATE POLICY "Users can manage invoice items" ON public.invoice_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.entities e ON e.id = i.entity_id
      WHERE i.id = invoice_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Document inbox policies
CREATE POLICY "Users can manage documents for their entities" ON public.document_inbox
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Accounting entries policies
CREATE POLICY "Users can manage entries for their entities" ON public.accounting_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Legal consents policies
CREATE POLICY "Users can manage their own consents" ON public.legal_consents
  FOR ALL USING (user_id = auth.uid());

-- Audit log policies
CREATE POLICY "Users can view audit logs for their entities" ON public.audit_log
  FOR SELECT USING (
    entity_id IS NULL OR EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "System can insert audit logs" ON public.audit_log
  FOR INSERT WITH CHECK (true);

-- Driver auto invoicing settings policies
CREATE POLICY "Drivers can manage their own auto invoicing settings" ON public.driver_auto_invoicing_settings
  FOR ALL USING (driver_user_id = auth.uid());

-- Driver B2B profiles policies
CREATE POLICY "Drivers can manage their own B2B profile" ON public.driver_b2b_profiles
  FOR ALL USING (driver_user_id = auth.uid());

-- Invoice recurring rules policies
CREATE POLICY "Users can manage recurring rules for their entities" ON public.invoice_recurring_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND (e.owner_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.accounting_assignments aa
        WHERE aa.entity_id = e.id AND aa.accounting_user_id = auth.uid()
      ))
    )
  );

-- Pricing config policies
CREATE POLICY "Users can view pricing for their entities" ON public.pricing_config
  FOR SELECT USING (
    entity_id IS NULL OR EXISTS (
      SELECT 1 FROM public.entities e
      WHERE e.id = entity_id AND e.owner_user_id = auth.uid()
    )
  );

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_entities_owner ON public.entities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_entities_nip ON public.entities(nip);
CREATE INDEX IF NOT EXISTS idx_accounting_assignments_user ON public.accounting_assignments(accounting_user_id);
CREATE INDEX IF NOT EXISTS idx_accounting_assignments_entity ON public.accounting_assignments(entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_entity ON public.invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_driver ON public.invoices(driver_id);
CREATE INDEX IF NOT EXISTS idx_invoices_fleet ON public.invoices(fleet_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_document_inbox_entity ON public.document_inbox(entity_id);
CREATE INDEX IF NOT EXISTS idx_document_inbox_status ON public.document_inbox(status);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_entity ON public.accounting_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_period ON public.accounting_entries(accounting_period);
CREATE INDEX IF NOT EXISTS idx_legal_consents_user ON public.legal_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_driver_auto_invoicing_user ON public.driver_auto_invoicing_settings(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_b2b_profiles_user ON public.driver_b2b_profiles(driver_user_id);

-- =============================================
-- INSERT NEW FEATURE TOGGLES
-- =============================================

INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES 
  ('module_accounting_enabled', 'Moduł księgowy', 'Włącz cały moduł finansowo-księgowy', false, 'accounting'),
  ('module_invoicing_basic', 'Podstawowe faktury', 'Wystawianie faktur VAT i rachunków', false, 'accounting'),
  ('module_invoicing_proforma', 'Faktury proforma', 'Wystawianie faktur proforma', false, 'accounting'),
  ('module_invoicing_corrections', 'Korekty faktur', 'Wystawianie korekt faktur', false, 'accounting'),
  ('module_invoicing_recurring', 'Faktury cykliczne', 'Automatyczne faktury cykliczne', false, 'accounting'),
  ('module_document_ocr_ai', 'OCR dokumentów', 'AI rozpoznawanie dokumentów kosztowych', false, 'accounting'),
  ('module_ksef_ready', 'KSeF (przygotowanie)', 'Przygotowanie do integracji z KSeF', false, 'accounting'),
  ('module_auto_invoicing_drivers', 'Autofakturowanie kierowców', 'Automatyczne fakturowanie kierowców B2B', false, 'accounting'),
  ('module_payments_tracking', 'Śledzenie płatności', 'Kontrola płatności i przypomnienia', false, 'accounting'),
  ('module_accounting_reports', 'Raporty księgowe', 'Generowanie raportów VAT, PIT, CIT', false, 'accounting')
ON CONFLICT (feature_key) DO NOTHING;

-- =============================================
-- TRIGGER FOR UPDATED_AT
-- =============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_entities_updated_at BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_invoice_recipients_updated_at BEFORE UPDATE ON public.invoice_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_document_inbox_updated_at BEFORE UPDATE ON public.document_inbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_driver_auto_invoicing_settings_updated_at BEFORE UPDATE ON public.driver_auto_invoicing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_driver_b2b_profiles_updated_at BEFORE UPDATE ON public.driver_b2b_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_invoice_recurring_rules_updated_at BEFORE UPDATE ON public.invoice_recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- User invoice companies (seller data that auto-fills)
CREATE TABLE public.user_invoice_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nip TEXT,
  address_street TEXT,
  address_building_number TEXT,
  address_apartment_number TEXT,
  address_city TEXT,
  address_postal_code TEXT,
  bank_name TEXT,
  bank_account TEXT,
  swift_code TEXT,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  is_default BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User issued invoices history
CREATE TABLE public.user_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.user_invoice_companies(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  invoice_type TEXT DEFAULT 'invoice',
  issue_date DATE NOT NULL,
  sale_date DATE,
  due_date DATE,
  issue_place TEXT,
  payment_method TEXT DEFAULT 'transfer',
  currency TEXT DEFAULT 'PLN',
  -- Buyer data (snapshot)
  buyer_name TEXT,
  buyer_nip TEXT,
  buyer_address TEXT,
  -- Totals
  net_total NUMERIC(12,2) DEFAULT 0,
  vat_total NUMERIC(12,2) DEFAULT 0,
  gross_total NUMERIC(12,2) DEFAULT 0,
  -- Payment status
  paid_amount NUMERIC(12,2) DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  -- Notes
  notes TEXT,
  -- PDF storage
  pdf_url TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Invoice items
CREATE TABLE public.user_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.user_invoices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC(10,3) DEFAULT 1,
  unit TEXT DEFAULT 'szt.',
  unit_net_price NUMERIC(12,2) DEFAULT 0,
  vat_rate TEXT DEFAULT '23',
  net_amount NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  gross_amount NUMERIC(12,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- User contractors (saved buyers for quick selection)
CREATE TABLE public.user_contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nip TEXT,
  address_street TEXT,
  address_building_number TEXT,
  address_apartment_number TEXT,
  address_city TEXT,
  address_postal_code TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_invoice_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contractors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_invoice_companies
CREATE POLICY "Users can view own companies" ON public.user_invoice_companies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own companies" ON public.user_invoice_companies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own companies" ON public.user_invoice_companies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own companies" ON public.user_invoice_companies
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for user_invoices
CREATE POLICY "Users can view own invoices" ON public.user_invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own invoices" ON public.user_invoices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invoices" ON public.user_invoices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own invoices" ON public.user_invoices
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for user_invoice_items (via invoice ownership)
CREATE POLICY "Users can view own invoice items" ON public.user_invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can insert own invoice items" ON public.user_invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update own invoice items" ON public.user_invoice_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.user_invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can delete own invoice items" ON public.user_invoice_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_invoices WHERE id = invoice_id AND user_id = auth.uid())
  );

-- RLS Policies for user_contractors
CREATE POLICY "Users can view own contractors" ON public.user_contractors
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contractors" ON public.user_contractors
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contractors" ON public.user_contractors
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contractors" ON public.user_contractors
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_invoice_companies_updated_at
  BEFORE UPDATE ON public.user_invoice_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_invoices_updated_at
  BEFORE UPDATE ON public.user_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_contractors_updated_at
  BEFORE UPDATE ON public.user_contractors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
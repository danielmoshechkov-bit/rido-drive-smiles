-- =====================================================
-- MODUŁ SALES CRM / CALL CENTER - TABELE I POLITYKI
-- =====================================================

-- 1. Tabela kategorii leadów 
CREATE TABLE IF NOT EXISTS public.sales_lead_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Domyślne kategorie
INSERT INTO public.sales_lead_categories (name, slug, icon, sort_order) VALUES
  ('Usługi', 'uslugi', 'Wrench', 1),
  ('Motoryzacja', 'motoryzacja', 'Car', 2),
  ('Nieruchomości', 'nieruchomosci', 'Building', 3)
ON CONFLICT (slug) DO NOTHING;

-- 2. Główna tabela leadów/klientów
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.sales_lead_categories(id),
  company_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT,
  address TEXT,
  website TEXT,
  nip TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'new',
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  registered_user_id UUID REFERENCES auth.users(id),
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_leads_phone ON public.sales_leads(phone);
CREATE INDEX IF NOT EXISTS idx_sales_leads_company ON public.sales_leads(LOWER(company_name));
CREATE INDEX IF NOT EXISTS idx_sales_leads_assigned ON public.sales_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_sales_leads_category ON public.sales_leads(category_id);

-- 3. Osoby kontaktowe przy leadzie
CREATE TABLE IF NOT EXISTS public.sales_lead_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_contacts_lead ON public.sales_lead_contacts(lead_id);

-- 4. Historia połączeń/kontaktów
CREATE TABLE IF NOT EXISTS public.sales_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES public.sales_lead_contacts(id),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  call_status TEXT NOT NULL,
  call_date TIMESTAMPTZ DEFAULT now(),
  callback_date TIMESTAMPTZ,
  duration_seconds INT,
  notes TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_call_logs_lead ON public.sales_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_call_logs_user ON public.sales_call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_call_logs_callback ON public.sales_call_logs(callback_date) WHERE callback_date IS NOT NULL;

-- 5. Wysłane zaproszenia mailowe
CREATE TABLE IF NOT EXISTS public.sales_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.sales_leads(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES public.sales_lead_contacts(id),
  sent_by UUID REFERENCES auth.users(id) NOT NULL,
  sent_to_email TEXT NOT NULL,
  template_type TEXT DEFAULT 'invitation',
  sent_at TIMESTAMPTZ DEFAULT now(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sales_invitations_lead ON public.sales_invitations(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_invitations_sent_by ON public.sales_invitations(sent_by);

-- 6. Ustawienia pracownika sprzedaży (w tym firmowy mail)
CREATE TABLE IF NOT EXISTS public.sales_user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  work_email TEXT,
  phone_extension TEXT,
  daily_call_target INT DEFAULT 20,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Statystyki dzienne pracownika
CREATE TABLE IF NOT EXISTS public.sales_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  leads_added INT DEFAULT 0,
  calls_made INT DEFAULT 0,
  calls_answered INT DEFAULT 0,
  emails_sent INT DEFAULT 0,
  registrations INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_sales_daily_stats_user_date ON public.sales_daily_stats(user_id, stat_date DESC);

-- 8. Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION public.update_sales_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sales_leads_updated_at ON public.sales_leads;
CREATE TRIGGER sales_leads_updated_at
  BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sales_leads_updated_at();

-- 9. Funkcja sprawdzająca czy użytkownik ma rolę sales
CREATE OR REPLACE FUNCTION public.is_sales_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
    AND role IN ('sales_admin', 'sales_rep')
  )
$$;

-- 10. Funkcja sprawdzająca czy jest sales admin
CREATE OR REPLACE FUNCTION public.is_sales_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
    AND role = 'sales_admin'
  )
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE public.sales_lead_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_daily_stats ENABLE ROW LEVEL SECURITY;

-- Categories - publiczne do odczytu
CREATE POLICY "Anyone can view lead categories"
ON public.sales_lead_categories FOR SELECT
USING (is_active = true);

CREATE POLICY "Sales admins can manage categories"
ON public.sales_lead_categories FOR ALL
TO authenticated
USING (public.is_sales_admin(auth.uid()));

-- Leads
CREATE POLICY "Sales users can view assigned leads"
ON public.sales_leads FOR SELECT
TO authenticated
USING (
  public.is_sales_admin(auth.uid()) OR 
  assigned_to = auth.uid() OR 
  created_by = auth.uid()
);

CREATE POLICY "Sales users can create leads"
ON public.sales_leads FOR INSERT
TO authenticated
WITH CHECK (public.is_sales_user(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Sales users can update their leads"
ON public.sales_leads FOR UPDATE
TO authenticated
USING (
  public.is_sales_admin(auth.uid()) OR 
  assigned_to = auth.uid() OR 
  created_by = auth.uid()
);

CREATE POLICY "Sales admins can delete leads"
ON public.sales_leads FOR DELETE
TO authenticated
USING (public.is_sales_admin(auth.uid()));

-- Contacts
CREATE POLICY "Sales users can view contacts"
ON public.sales_lead_contacts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_leads sl
    WHERE sl.id = lead_id
    AND (public.is_sales_admin(auth.uid()) OR sl.assigned_to = auth.uid() OR sl.created_by = auth.uid())
  )
);

CREATE POLICY "Sales users can manage contacts"
ON public.sales_lead_contacts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sales_leads sl
    WHERE sl.id = lead_id
    AND (public.is_sales_admin(auth.uid()) OR sl.assigned_to = auth.uid() OR sl.created_by = auth.uid())
  )
);

CREATE POLICY "Sales users can update contacts"
ON public.sales_lead_contacts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_leads sl
    WHERE sl.id = lead_id
    AND (public.is_sales_admin(auth.uid()) OR sl.assigned_to = auth.uid() OR sl.created_by = auth.uid())
  )
);

CREATE POLICY "Sales users can delete contacts"
ON public.sales_lead_contacts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_leads sl
    WHERE sl.id = lead_id
    AND (public.is_sales_admin(auth.uid()) OR sl.assigned_to = auth.uid() OR sl.created_by = auth.uid())
  )
);

-- Call Logs
CREATE POLICY "Sales users can view call logs"
ON public.sales_call_logs FOR SELECT
TO authenticated
USING (
  public.is_sales_admin(auth.uid()) OR 
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.sales_leads sl
    WHERE sl.id = lead_id AND (sl.assigned_to = auth.uid() OR sl.created_by = auth.uid())
  )
);

CREATE POLICY "Sales users can create call logs"
ON public.sales_call_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_sales_user(auth.uid()) AND user_id = auth.uid());

-- Invitations
CREATE POLICY "Sales users can view invitations"
ON public.sales_invitations FOR SELECT
TO authenticated
USING (public.is_sales_admin(auth.uid()) OR sent_by = auth.uid());

CREATE POLICY "Sales users can create invitations"
ON public.sales_invitations FOR INSERT
TO authenticated
WITH CHECK (public.is_sales_user(auth.uid()) AND sent_by = auth.uid());

-- User Settings
CREATE POLICY "Users can view own settings"
ON public.sales_user_settings FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_sales_admin(auth.uid()));

CREATE POLICY "Users can manage own settings"
ON public.sales_user_settings FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own settings"
ON public.sales_user_settings FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR public.is_sales_admin(auth.uid()));

-- Daily Stats
CREATE POLICY "Users can view own stats"
ON public.sales_daily_stats FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_sales_admin(auth.uid()));

CREATE POLICY "System can manage stats"
ON public.sales_daily_stats FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own stats"
ON public.sales_daily_stats FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
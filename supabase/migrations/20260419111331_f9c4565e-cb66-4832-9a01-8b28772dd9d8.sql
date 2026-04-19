
-- Add resolved_at if missing
ALTER TABLE public.pending_service_reviews
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- =========================================
-- 1. STAWKI PROWIZJI
-- =========================================
CREATE TABLE IF NOT EXISTS public.service_provider_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  category_id UUID NULL,
  commission_type TEXT NOT NULL DEFAULT 'percent_margin' CHECK (commission_type IN ('percent_margin','flat_per_booking','percent_total')),
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  valid_from DATE NULL,
  valid_to DATE NULL,
  is_promo BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spc_provider ON public.service_provider_commissions(provider_id);
CREATE INDEX IF NOT EXISTS idx_spc_category ON public.service_provider_commissions(category_id);

ALTER TABLE public.service_provider_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages commissions" ON public.service_provider_commissions;
CREATE POLICY "Admin manages commissions"
  ON public.service_provider_commissions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Provider sees own commissions" ON public.service_provider_commissions;
CREATE POLICY "Provider sees own commissions"
  ON public.service_provider_commissions FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_spc_updated_at ON public.service_provider_commissions;
CREATE TRIGGER trg_spc_updated_at
  BEFORE UPDATE ON public.service_provider_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- 2. ROZSZERZENIE service_bookings
-- =========================================
ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS parts_margin NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS labor_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS commission_base NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_invoice_id UUID,
  ADD COLUMN IF NOT EXISTS completion_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_token TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_completion ON public.service_bookings(provider_id, completion_status);
CREATE INDEX IF NOT EXISTS idx_bookings_invoice ON public.service_bookings(commission_invoice_id);

-- =========================================
-- 3. ROZSZERZENIE service_reviews
-- =========================================
ALTER TABLE public.service_reviews
  ADD COLUMN IF NOT EXISTS rating_time INTEGER,
  ADD COLUMN IF NOT EXISTS rating_quality INTEGER,
  ADD COLUMN IF NOT EXISTS rating_price INTEGER,
  ADD COLUMN IF NOT EXISTS final_cost_reported NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS booking_id UUID;

CREATE INDEX IF NOT EXISTS idx_reviews_booking ON public.service_reviews(booking_id);

-- =========================================
-- 4. FAKTURY PROWIZYJNE PORTALU
-- =========================================
CREATE TABLE IF NOT EXISTS public.service_commission_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  invoice_number TEXT,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  bookings_count INTEGER NOT NULL DEFAULT 0,
  bookings_total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 23.00,
  total_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  due_date DATE,
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_commission_invoices_provider ON public.service_commission_invoices(provider_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_commission_invoices_status ON public.service_commission_invoices(status);

ALTER TABLE public.service_commission_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider sees own commission invoices" ON public.service_commission_invoices;
CREATE POLICY "Provider sees own commission invoices"
  ON public.service_commission_invoices FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admin manages commission invoices" ON public.service_commission_invoices;
CREATE POLICY "Admin manages commission invoices"
  ON public.service_commission_invoices FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_commission_invoices_updated_at ON public.service_commission_invoices;
CREATE TRIGGER trg_commission_invoices_updated_at
  BEFORE UPDATE ON public.service_commission_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for blocking lookup
CREATE INDEX IF NOT EXISTS idx_pending_reviews_user_active 
  ON public.pending_service_reviews(user_id) WHERE resolved_at IS NULL;

-- =========================================
-- 5. FUNKCJE
-- =========================================
CREATE OR REPLACE FUNCTION public.user_has_pending_reviews(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pending_service_reviews
    WHERE user_id = p_user_id AND resolved_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.get_active_commission(p_provider_id UUID, p_category_id UUID DEFAULT NULL)
RETURNS TABLE(commission_type TEXT, commission_value NUMERIC)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT commission_type, commission_value
  FROM public.service_provider_commissions
  WHERE provider_id = p_provider_id
    AND (category_id = p_category_id OR category_id IS NULL)
    AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
    AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
  ORDER BY 
    is_promo DESC,
    (category_id IS NOT NULL) DESC,
    created_at DESC
  LIMIT 1;
$$;

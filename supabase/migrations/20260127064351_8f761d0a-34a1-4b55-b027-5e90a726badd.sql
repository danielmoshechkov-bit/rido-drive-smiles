-- Add paid_at column to user_invoices table
ALTER TABLE public.user_invoices 
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.user_invoices.paid_at IS 'Timestamp when invoice was marked as paid';

-- =====================================================
-- AI PRO MODULE - Full implementation
-- =====================================================

-- AI PRO Subscription statuses per entity
CREATE TABLE IF NOT EXISTS public.ai_pro_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'trial_active', 'trial_expired', 'active_paid', 'active_comped', 'pending_payment')),
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  price_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_id)
);

-- AI PRO Exemptions (early access, free forever, etc.)
CREATE TABLE IF NOT EXISTS public.ai_pro_exemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  scope JSONB DEFAULT '["*"]'::jsonb,
  valid_until TIMESTAMPTZ,
  note TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on lowercase email
CREATE UNIQUE INDEX IF NOT EXISTS ai_pro_exemptions_email_lower_idx 
ON public.ai_pro_exemptions (LOWER(email));

-- AI Jobs log (audit trail for AI usage)
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  user_id UUID,
  job_type TEXT NOT NULL CHECK (job_type IN ('profit_analysis', 'invoice_extract', 'inventory_advice', 'sales_copy', 'compliance_check', 'tax_advice', 'image_enhance')),
  provider TEXT CHECK (provider IN ('openai', 'gemini', 'lovable_ai')),
  input_snapshot JSONB,
  output_snapshot JSONB,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI PRO Pricing config
CREATE TABLE IF NOT EXISTS public.ai_pro_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_pln_monthly NUMERIC(10,2) DEFAULT 99.00,
  currency TEXT DEFAULT 'PLN',
  billing_mode TEXT DEFAULT 'manual_now' CHECK (billing_mode IN ('manual_now', 'future_subscription_ready')),
  trial_days INT DEFAULT 14,
  show_paywall BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default pricing config
INSERT INTO public.ai_pro_pricing_config (id, price_pln_monthly, currency, billing_mode, trial_days, show_paywall)
VALUES ('00000000-0000-0000-0000-000000000001', 99.00, 'PLN', 'manual_now', 14, true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE public.ai_pro_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pro_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pro_pricing_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_pro_subscriptions
CREATE POLICY "Users can view their entity AI PRO subscriptions"
ON public.ai_pro_subscriptions FOR SELECT
USING (
  entity_id IN (
    SELECT id FROM public.entities WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage their entity AI PRO subscriptions"
ON public.ai_pro_subscriptions FOR ALL
USING (
  entity_id IN (
    SELECT id FROM public.entities WHERE owner_user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all AI PRO subscriptions"
ON public.ai_pro_subscriptions FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS for ai_pro_exemptions (admin only)
CREATE POLICY "Admins can manage AI PRO exemptions"
ON public.ai_pro_exemptions FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can check their own exemption"
ON public.ai_pro_exemptions FOR SELECT
USING (LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())));

-- RLS for ai_jobs
CREATE POLICY "Users can view their AI jobs"
ON public.ai_jobs FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their AI jobs"
ON public.ai_jobs FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all AI jobs"
ON public.ai_jobs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS for pricing config (public read)
CREATE POLICY "Anyone can read pricing config"
ON public.ai_pro_pricing_config FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can update pricing config"
ON public.ai_pro_pricing_config FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Insert AI PRO feature flags
INSERT INTO public.feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES 
  ('ai_pro_enabled', 'AI PRO - Moduł', 'Główny moduł AI PRO (płatny)', false, 'ai_pro'),
  ('ai_pro_trial_enabled', 'AI PRO - Trial', 'Możliwość uruchomienia 14-dniowego trial', true, 'ai_pro'),
  ('ai_profit_analysis_enabled', 'AI Analiza zysku', 'Analiza marży i ostrzeżenia', false, 'ai_pro'),
  ('ai_invoice_ocr_extract_enabled', 'AI OCR faktur', 'Ekstrakcja danych z faktur', false, 'ai_pro'),
  ('ai_inventory_assistant_enabled', 'AI Asystent magazynu', 'Sugestie mapowań i cen', false, 'ai_pro'),
  ('ai_sales_copy_assistant_enabled', 'AI Opisy sprzedażowe', 'Generowanie opisów produktów', false, 'ai_pro'),
  ('ai_compliance_checks_enabled', 'AI Kontrola zgodności', 'Sprawdzanie NIP, VAT, braków', false, 'ai_pro'),
  ('ai_tax_advisor_enabled', 'AI Doradca podatkowy', 'Szacunkowe porady podatkowe', false, 'ai_pro')
ON CONFLICT (feature_key) DO UPDATE 
SET feature_name = EXCLUDED.feature_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Function to check if user has AI PRO access
CREATE OR REPLACE FUNCTION public.has_ai_pro_access(p_user_id UUID, p_entity_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email TEXT;
  v_has_exemption BOOLEAN;
  v_subscription_status TEXT;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  
  -- Check exemption
  SELECT EXISTS (
    SELECT 1 FROM ai_pro_exemptions 
    WHERE LOWER(email) = LOWER(v_user_email)
    AND (valid_until IS NULL OR valid_until > now())
  ) INTO v_has_exemption;
  
  IF v_has_exemption THEN
    RETURN true;
  END IF;
  
  -- Check subscription for entity
  IF p_entity_id IS NOT NULL THEN
    SELECT status INTO v_subscription_status 
    FROM ai_pro_subscriptions 
    WHERE entity_id = p_entity_id;
    
    IF v_subscription_status IN ('trial_active', 'active_paid', 'active_comped') THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;
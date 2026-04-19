-- Add workshop_order_id to user_invoices to link invoices with workshop orders
ALTER TABLE public.user_invoices 
ADD COLUMN IF NOT EXISTS workshop_order_id UUID;

CREATE INDEX IF NOT EXISTS idx_user_invoices_workshop_order_id 
ON public.user_invoices(workshop_order_id) 
WHERE workshop_order_id IS NOT NULL;

-- Add master switch for KSeF (separate from auto-send toggle)
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS ksef_send_invoices_enabled BOOLEAN DEFAULT false;

-- Migrate existing: anyone with auto_send_enabled = true also gets send_invoices_enabled = true
UPDATE public.company_settings 
SET ksef_send_invoices_enabled = true 
WHERE ksef_auto_send_enabled = true AND ksef_send_invoices_enabled = false;

ALTER TABLE public.user_invoices 
ADD COLUMN IF NOT EXISTS is_correction boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS corrected_invoice_id uuid REFERENCES public.user_invoices(id),
ADD COLUMN IF NOT EXISTS corrected_invoice_number text,
ADD COLUMN IF NOT EXISTS correction_reason text;

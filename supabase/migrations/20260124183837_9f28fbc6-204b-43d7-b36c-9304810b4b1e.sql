-- Add bank_account column to invoice_recipients for whitelist verification
ALTER TABLE public.invoice_recipients 
ADD COLUMN IF NOT EXISTS bank_account TEXT;

COMMENT ON COLUMN public.invoice_recipients.bank_account IS 'Numer konta bankowego kontrahenta do weryfikacji na białej liście VAT';
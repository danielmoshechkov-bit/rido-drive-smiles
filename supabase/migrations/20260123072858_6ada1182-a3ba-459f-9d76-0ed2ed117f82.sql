-- Add invoice_numbering_mode column to driver_auto_invoicing_settings
ALTER TABLE public.driver_auto_invoicing_settings 
ADD COLUMN IF NOT EXISTS invoice_numbering_mode TEXT DEFAULT 'auto' 
CHECK (invoice_numbering_mode IN ('auto', 'ask_each_time'));
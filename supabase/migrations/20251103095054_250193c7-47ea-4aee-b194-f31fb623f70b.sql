-- Add payment method and IBAN columns to drivers table
ALTER TABLE public.drivers 
ADD COLUMN payment_method text DEFAULT 'transfer' CHECK (payment_method IN ('transfer', 'cash'));

ALTER TABLE public.drivers 
ADD COLUMN iban text;

COMMENT ON COLUMN public.drivers.payment_method IS 'Preferred payment method: transfer (przelew) or cash (gotówka)';
COMMENT ON COLUMN public.drivers.iban IS 'Bank account number (IBAN) for transfers';
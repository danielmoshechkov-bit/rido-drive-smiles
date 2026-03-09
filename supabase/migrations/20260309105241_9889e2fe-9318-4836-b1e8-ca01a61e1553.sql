
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS b2b_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS b2b_company_name text,
  ADD COLUMN IF NOT EXISTS b2b_nip text,
  ADD COLUMN IF NOT EXISTS b2b_address text,
  ADD COLUMN IF NOT EXISTS b2b_vat_payer boolean DEFAULT false;


-- Add settlement mode fields to fleets table
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS settlement_mode text NOT NULL DEFAULT 'single_tax';
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS secondary_vat_rate numeric NOT NULL DEFAULT 23;
ALTER TABLE public.fleets ADD COLUMN IF NOT EXISTS additional_percent_rate numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fleets.settlement_mode IS 'single_tax = current mode (one VAT from total brutto), dual_tax = two separate VAT calculations from different Bolt CSV columns';
COMMENT ON COLUMN public.fleets.secondary_vat_rate IS 'VAT rate for Bolt campaign/cancellation/refund columns (I+J+K) in dual_tax mode, default 23%';
COMMENT ON COLUMN public.fleets.additional_percent_rate IS 'Additional percentage deducted from Bolt brutto (E+F) in dual_tax mode';

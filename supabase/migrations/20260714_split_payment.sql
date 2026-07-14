-- FAZA 3 (fix/faktury-mega): MPP / split payment.
-- Faktury >= 15 000 zł brutto za towary/usługi z załącznika nr 15 ustawy o VAT
-- muszą mieć adnotację "mechanizm podzielonej płatności" (KSeF: P_18A=1).
ALTER TABLE public.user_invoices ADD COLUMN IF NOT EXISTS split_payment boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.user_invoices.split_payment IS
  'Mechanizm podzielonej płatności (MPP): true = adnotacja na PDF i P_18A=1 w KSeF.';

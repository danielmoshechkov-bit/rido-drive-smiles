-- FAZA 2 (fix/faktury-mega): podstawa prawna zwolnienia z VAT dla faktur zw.
-- Wymóg art. 106e ust. 1 pkt 19 ustawy o VAT (przepis na fakturze) i pola
-- P_19A w KSeF FA(3). Kolumna we wszystkich źródłach danych sprzedawcy,
-- z których czyta resolveSellerEntityForInvoice (select *).
ALTER TABLE public.user_invoice_companies ADD COLUMN IF NOT EXISTS vat_exemption_basis text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS vat_exemption_basis text;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS vat_exemption_basis text;
COMMENT ON COLUMN public.user_invoice_companies.vat_exemption_basis IS
  'Podstawa prawna zwolnienia z VAT (np. art. 113 ust. 1 ustawy o VAT) — na PDF faktury zw i w KSeF P_19A.';

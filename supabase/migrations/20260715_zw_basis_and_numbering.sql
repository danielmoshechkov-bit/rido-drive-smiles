-- fix/faktury-mega: (1) podstawa zwolnienia PER POZYCJA (jak iFirma),
-- (2) konfigurowalny tryb numeracji faktur per firma.
ALTER TABLE public.user_invoice_items
  ADD COLUMN IF NOT EXISTS vat_exemption_basis text,
  ADD COLUMN IF NOT EXISTS vat_exemption_basis_type text; -- 'ustawa' | 'dyrektywa' | 'inna'
COMMENT ON COLUMN public.user_invoice_items.vat_exemption_basis IS
  'Podstawa prawna zwolnienia z VAT dla pozycji ze stawką zw (na PDF przy pozycji; do KSeF P_19A/B/C).';

ALTER TABLE public.user_invoice_companies
  ADD COLUMN IF NOT EXISTS numbering_mode text NOT NULL DEFAULT 'continuous';
COMMENT ON COLUMN public.user_invoice_companies.numbering_mode IS
  'Tryb auto-numeracji faktur: continuous (MAX+1, luki przepadają) | fill_gaps (najniższy wolny numer) | manual (MAX+1, dowolna ręczna zmiana z walidacją duplikatów).';

-- Faktury zakupowe z KSeF (eksport paczki): typ dokumentu + powiązanie korekty.
-- Pozwala rozróżnić VAT/KOR/ZAL/ROZ i powiązać korektę z fakturą pierwotną
-- bez ponownego pobierania z KSeF (dane lecą z XML w trakcie pull-a eksportowego).

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS corrected_ksef_number text,
  ADD COLUMN IF NOT EXISTS corrected_invoice_number text;

COMMENT ON COLUMN public.purchase_invoices.document_type IS
  'RodzajFaktury z KSeF XML: VAT / KOR / ZAL / ROZ / UPR / KOR_ZAL / KOR_ROZ itd.';
COMMENT ON COLUMN public.purchase_invoices.corrected_ksef_number IS
  'Dla korekt (KOR): numer KSeF faktury pierwotnej z <DaneFaKorygowanej>';
COMMENT ON COLUMN public.purchase_invoices.corrected_invoice_number IS
  'Dla korekt (KOR): numer faktury pierwotnej (NrFaKorygowanej) z <DaneFaKorygowanej>';

-- Szybsze wyszukiwanie korekt powiązanych z daną fakturą pierwotną
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_corrected_ksef
  ON public.purchase_invoices (corrected_ksef_number)
  WHERE corrected_ksef_number IS NOT NULL;

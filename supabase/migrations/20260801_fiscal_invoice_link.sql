-- =====================================================================
-- POWIĄZANIE FAKTURA ↔ PARAGON
--
-- Klient wraca po fakturę do wcześniejszego paragonu. Sprzedaż jest już ujęta
-- w raporcie dobowym (RO), więc taka faktura NIE MOŻE zwiększyć obrotu drugi raz —
-- musi być rozpoznawalna w księgowości i wyłączona ze zbiorczego ujęcia sprzedaży.
--
-- Kierunek zależności: faktura wie o paragonie, moduł fiskalny nie wie o fakturach.
-- Dzięki temu rdzeń fiskalny zostaje branżowo i modułowo neutralny.
-- =====================================================================

ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS fiscal_receipt_id uuid
    REFERENCES public.fiscal_receipts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_invoices_fiscal_receipt
  ON public.user_invoices (fiscal_receipt_id)
  WHERE fiscal_receipt_id IS NOT NULL;

COMMENT ON COLUMN public.user_invoices.fiscal_receipt_id IS
  'Faktura wystawiona DO paragonu fiskalnego. Sprzedaż jest już w raporcie dobowym (RO) — przy rozliczeniu VAT tej faktury nie wolno liczyć ponownie do obrotu.';

-- =====================================================================
-- EWIDENCJA ZWROTÓW — uzupełnienie do wymogów § 3 ust. 3 rozporządzenia MF
-- z 25.06.2025 (Dz.U. 2025 poz. 845), obowiązującego od 2026.
--
-- Ewidencja musi być samodzielnym dokumentem: dane sprzedaży przepisujemy do wpisu,
-- zamiast polegać na złączeniu z fiscal_receipts (paragon może zostać usunięty razem
-- z tenantem, a ewidencja jest dokumentem księgowym).
-- =====================================================================

ALTER TABLE public.fiscal_returns
  -- § 3 ust. 3 pkt 1: data sprzedaży (nie data zwrotu!)
  ADD COLUMN IF NOT EXISTS sale_date date,
  -- § 3 ust. 3 pkt 5: dokument potwierdzający sprzedaż — numer paragonu przepisany do ewidencji
  ADD COLUMN IF NOT EXISTS receipt_number integer,
  -- rozróżnienie wymagane przez pkt 3 i 4: zwrot całości vs części należności
  ADD COLUMN IF NOT EXISTS return_type text
    CHECK (return_type IN ('full', 'partial')),
  -- § 3 ust. 3 pkt 6: protokół podpisany przez SPRZEDAWCĘ I NABYWCĘ
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS seller_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_signed_at timestamptz,
  -- § B3: wskazanie raportu, którego dotyczy korekta obrotu (dowód wewnętrzny)
  ADD COLUMN IF NOT EXISTS report_date date;

COMMENT ON COLUMN public.fiscal_returns.sale_date IS
  'Data pierwotnej sprzedaży (§ 3 ust. 3 pkt 1). Zwrot pomniejsza obrót w dacie sprzedaży, nie zwrotu.';
COMMENT ON COLUMN public.fiscal_returns.return_type IS
  'full = zwrot całości należności (pkt 3), partial = zwrot części (pkt 4). Decyduje o sposobie wykazania w ewidencji.';
COMMENT ON COLUMN public.fiscal_returns.report_date IS
  'Data raportu dobowego, którego dotyczy korekta obrotu — potrzebna do dowodu wewnętrznego i eksportu RO.';

-- Uzupełnienie istniejących wpisów danymi z paragonu (jednorazowo, idempotentnie).
UPDATE public.fiscal_returns r
   SET sale_date = COALESCE(r.sale_date, (rec.printed_at AT TIME ZONE 'Europe/Warsaw')::date),
       receipt_number = COALESCE(r.receipt_number, rec.printer_receipt_number),
       report_date = COALESCE(r.report_date, (rec.printed_at AT TIME ZONE 'Europe/Warsaw')::date),
       return_type = COALESCE(r.return_type, CASE WHEN r.amount_grosze >= rec.total_grosze THEN 'full' ELSE 'partial' END)
  FROM public.fiscal_receipts rec
 WHERE rec.id = r.receipt_id
   AND (r.sale_date IS NULL OR r.receipt_number IS NULL OR r.return_type IS NULL OR r.report_date IS NULL);

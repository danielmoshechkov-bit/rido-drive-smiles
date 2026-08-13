-- =====================================================================
-- FISKALIZACJA — blokada podwójnej fiskalizacji jednego dokumentu
--
-- Drugi paragon do tej samej sprzedaży podwaja zarejestrowany obrót (błąd podatkowy).
-- Blokada działa na poziomie bazy, więc nie da się jej obejść odświeżeniem strony
-- ani drugim oknem przeglądarki.
--
-- SEMANTYKA:
--   'printing' = REZERWACJA (trwa wydruk) — wchodzi do indeksu, więc dwa równoległe
--                żądania nie przejdą; drugie dostanie błąd unikalności
--   'printed'  = paragon wyszedł           — blokuje na stałe
--   'failed' / 'cancelled' = paragon NIE wyszedł, obrót nie zarejestrowany
--                → NIE wchodzą do indeksu, ponowna fiskalizacja jest dozwolona
--
-- Migracja idempotentna. Wymaga 20260730_fiscal_core.sql.
-- =====================================================================

-- Numer ostatniego paragonu odczytany z drukarki PRZED wydrukiem (Esc 66H).
-- Służy do automatycznego rozstrzygania wpisów, które utknęły w stanie 'printing':
-- jeśli licznik drukarki wzrósł, paragon jednak wyszedł.
ALTER TABLE public.fiscal_receipts
  ADD COLUMN IF NOT EXISTS printer_number_before integer;

COMMENT ON COLUMN public.fiscal_receipts.printer_number_before IS
  'Licznik paragonów drukarki (Esc 66H) sprzed wydruku. Wzrost licznika = paragon wyszedł, mimo braku potwierdzenia.';

-- Jeden paragon na dokument źródłowy.
-- document_id IS NULL (paragon ręczny, bez dokumentu) nie podlega blokadzie.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_receipts_one_per_document
  ON public.fiscal_receipts (document_type, document_id)
  WHERE status IN ('printing', 'printed') AND document_id IS NOT NULL;

COMMENT ON INDEX public.idx_fiscal_receipts_one_per_document IS
  'Blokada podwójnej fiskalizacji: jeden paragon (lub trwająca rezerwacja) na dokument źródłowy.';

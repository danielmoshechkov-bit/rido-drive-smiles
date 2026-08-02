-- =====================================================================
-- RAPORT FISKALNY MIESIĘCZNY — ślad wykonania
--
-- Obowiązek: raport miesięczny sporządza się po zakończeniu sprzedaży za dany miesiąc,
-- w terminie do 25. dnia miesiąca następnego. Brak raportu to nieprawidłowość przy kontroli,
-- a sam raport wychodzi z drukarki — system musi jedynie wiedzieć, CZY został wykonany,
-- żeby przypomnieć przed terminem i pokazać stan księgowej.
--
-- Dlaczego tylko ślad, a nie wykonanie: udokumentowana lista sekwencji ElzabESC (Redakcja 36)
-- zawiera raport dobowy (Esc 25H) i nie zawiera miesięcznego. Sekwencji nie zgadujemy —
-- na tej drukarce jedna zła sekwencja zawiesza urządzenie (sprawdzone na Esc 04H).
-- Po otrzymaniu dokumentacji producenta dołoży się wykonanie jednym przyciskiem.
-- =====================================================================

ALTER TABLE public.fiscal_printers
  ADD COLUMN IF NOT EXISTS last_month_report_period text,      -- 'YYYY-MM', którego miesiąca dotyczy
  ADD COLUMN IF NOT EXISTS last_month_report_at timestamptz;   -- kiedy potwierdzono wykonanie

COMMENT ON COLUMN public.fiscal_printers.last_month_report_period IS
  'Miesiąc (YYYY-MM), za który wykonano ostatni raport fiskalny miesięczny.';
COMMENT ON COLUMN public.fiscal_printers.last_month_report_at IS
  'Kiedy potwierdzono wykonanie raportu miesięcznego. Termin ustawowy: do 25. dnia następnego miesiąca.';

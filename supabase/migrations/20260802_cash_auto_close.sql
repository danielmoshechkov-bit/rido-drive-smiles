-- =====================================================================
-- AUTOMATYCZNE ZAMKNIĘCIE MIESIĄCA W KASIE
--
-- PO CO: zamknięcie miesiąca to czynność, o której najłatwiej zapomnieć — a bez niego
-- kolejny miesiąc liczy się dalej „na tym samym stosie" i raport przestaje odpowiadać
-- rzeczywistości. Przełącznik pozwala zdjąć to z głowy: system domyka poprzedni miesiąc
-- sam, przy pierwszym wejściu do Kasy po jego zakończeniu, i zapisuje raport do archiwum.
--
-- Ustawienie jest FIRMOWE, nie komputerowe: zamknięcie ma nastąpić raz, niezależnie od
-- tego, kto pierwszy się zaloguje.
-- =====================================================================

ALTER TABLE public.workshop_finance_settings
  ADD COLUMN IF NOT EXISTS auto_close_month boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workshop_finance_settings.auto_close_month IS
  'Gdy true, kasa sama zamyka poprzedni miesiąc i zapisuje raport przy pierwszym wejściu w nowym miesiącu.';

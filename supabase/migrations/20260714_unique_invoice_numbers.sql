-- FAZA 4 (fix/faktury-mega): blokada duplikatów numerów faktur.
-- Unikalny indeks częściowy jest niemożliwy — w danych są historyczne duplikaty
-- (FV/2026/01/001 x3, FV/2026/02/001 x2, not_sent), których nie wolno przenumerować
-- automatycznie. Zamiast tego trigger: blokuje NOWE duplikaty wśród aktywnych
-- (deleted_at IS NULL) faktur tego samego użytkownika; istniejące wiersze działają
-- dalej (zmiana np. statusu płatności starego duplikatu nie jest blokowana, dopóki
-- nie zmienia numeru ani nie przywraca z kosza).
CREATE OR REPLACE FUNCTION public.prevent_duplicate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- UPDATE bez zmiany numeru na już-aktywnym wierszu: nie wprowadza nowego konfliktu
  IF TG_OP = 'UPDATE'
     AND NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number
     AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_invoices
    WHERE user_id = NEW.user_id
      AND invoice_number = NEW.invoice_number
      AND deleted_at IS NULL
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Aktywna faktura o numerze % już istnieje. Wybierz inny numer.', NEW.invoice_number
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unique_invoice_number ON public.user_invoices;
CREATE TRIGGER trg_unique_invoice_number
  BEFORE INSERT OR UPDATE ON public.user_invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_invoice_number();

-- Indeks pod szybkie sprawdzanie (nieunikalny — duplikaty historyczne zostają)
CREATE INDEX IF NOT EXISTS idx_user_invoices_number_active
  ON public.user_invoices (user_id, invoice_number)
  WHERE deleted_at IS NULL;

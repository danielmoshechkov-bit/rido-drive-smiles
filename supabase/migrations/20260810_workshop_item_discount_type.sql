-- Rabat na pozycjach zlecenia warsztatowego: zapamiętanie jednostki (% / zł)
-- oraz kwoty wpisanej przez użytkownika.
--
-- Do tej pory zapisywany był wyłącznie `discount_percent`, więc po wyjściu ze
-- zlecenia rabat kwotowy wracał do procentów (przeliczony). Nowe kolumny
-- przechowują to, co użytkownik faktycznie wybrał i wpisał.
--
-- `discount_percent` pozostaje wartością kanoniczną dla sum, kosztorysu i PDF —
-- nowe kolumny są wyłącznie warstwą prezentacji/intencji użytkownika.

ALTER TABLE public.workshop_order_items
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS discount_amount numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workshop_order_items'::regclass
      AND conname = 'workshop_order_items_discount_type_check'
  ) THEN
    ALTER TABLE public.workshop_order_items
      ADD CONSTRAINT workshop_order_items_discount_type_check
      CHECK (discount_type IN ('percent', 'amount'));
  END IF;
END $$;

COMMENT ON COLUMN public.workshop_order_items.discount_type IS
  'Jednostka rabatu wybrana przez użytkownika: percent = %, amount = zł. Prezentacja; sumy liczy discount_percent.';
COMMENT ON COLUMN public.workshop_order_items.discount_amount IS
  'Kwota rabatu wpisana przez użytkownika, gdy discount_type = amount (w tej samej wartości netto/brutto co pozycja). NULL dla rabatu procentowego.';

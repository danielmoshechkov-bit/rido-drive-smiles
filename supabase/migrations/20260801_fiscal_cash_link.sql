-- =====================================================================
-- POWIĄZANIE SPRZEDAŻY FISKALNEJ Z KASĄ
--
-- Forma płatności wybrana na paragonie steruje przepływem gotówki:
--   paragon → wpłata (workshop_payments)
--   zwrot   → wypłata (workshop_expenses, kategoria 'wyplata')
--   pomyłka → STORNO błędnej wpłaty (voided), nie wypłata — przy pomyłce pieniądze
--             nigdy nie wpłynęły w błędnej wysokości, więc wydatek byłby nieprawdą
--
-- Unikalne indeksy są zabezpieczeniem przed podwójnym ujęciem obrotu: nawet dwa
-- równoległe kliknięcia nie utworzą drugiej wpłaty do tego samego paragonu.
--
-- Kierunek zależności: tabele branżowe wiedzą o module fiskalnym, nie odwrotnie.
-- =====================================================================

ALTER TABLE public.workshop_payments
  ADD COLUMN IF NOT EXISTS fiscal_receipt_id uuid
    REFERENCES public.fiscal_receipts(id) ON DELETE SET NULL;

-- Jedna nieanulowana wpłata na paragon.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_payments_one_per_receipt
  ON public.workshop_payments (fiscal_receipt_id)
  WHERE fiscal_receipt_id IS NOT NULL AND voided IS NOT TRUE;

ALTER TABLE public.workshop_expenses
  ADD COLUMN IF NOT EXISTS fiscal_return_id uuid
    REFERENCES public.fiscal_returns(id) ON DELETE SET NULL;

-- Jeden nieanulowany wydatek na zwrot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_expenses_one_per_return
  ON public.workshop_expenses (fiscal_return_id)
  WHERE fiscal_return_id IS NOT NULL AND voided IS NOT TRUE;

COMMENT ON COLUMN public.workshop_payments.fiscal_receipt_id IS
  'Wpłata utworzona z paragonu fiskalnego. Storno (voided) przy korekcie oczywistej pomyłki.';
COMMENT ON COLUMN public.workshop_expenses.fiscal_return_id IS
  'Wypłata z tytułu zwrotu z ewidencji zwrotów — realne oddanie pieniędzy klientowi.';

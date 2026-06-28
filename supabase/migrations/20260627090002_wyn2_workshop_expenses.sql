-- WYN2 (Pack 2) — Wydatki firmy (Zakup / Opłaty / Wypłaty).
-- PO CO: jedno miejsce na realne wypływy: części, prąd, internet, czynsz, pensje,
-- zaliczki, premie. Zasila przepływ i stan kasy (Pack 5). recurring_cost_id wiąże
-- pozycję z szablonem opłaty cyklicznej (FK dokładany w WYN3). employee_id wiąże
-- wypłatę/zaliczkę z pracownikiem.

CREATE TABLE IF NOT EXISTS public.workshop_expenses (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id      uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  category         text        NOT NULL CHECK (category IN ('zakup','oplata','wyplata')),
  subcategory      text,                       -- np. czesci, internet, czynsz, prad, pensja, zaliczka, premia
  description      text,
  amount           numeric     NOT NULL CHECK (amount >= 0),
  method           text        CHECK (method IN ('gotowka','karta','blik','przelew')),
  document_url     text,                       -- faktura/paragon (bucket 'documents')
  expense_date     date        NOT NULL DEFAULT current_date,
  recurring_cost_id uuid,                      -- FK → workshop_recurring_costs (WYN3)
  employee_id      uuid        REFERENCES public.workshop_employees(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_expenses_provider_date ON public.workshop_expenses(provider_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_workshop_expenses_category      ON public.workshop_expenses(provider_id, category);
CREATE INDEX IF NOT EXISTS idx_workshop_expenses_employee      ON public.workshop_expenses(employee_id);

ALTER TABLE public.workshop_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wexp_select ON public.workshop_expenses;
DROP POLICY IF EXISTS wexp_insert ON public.workshop_expenses;
DROP POLICY IF EXISTS wexp_update ON public.workshop_expenses;
DROP POLICY IF EXISTS wexp_delete ON public.workshop_expenses;

CREATE POLICY wexp_select ON public.workshop_expenses FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wexp_insert ON public.workshop_expenses FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wexp_update ON public.workshop_expenses FOR UPDATE
  USING      (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wexp_delete ON public.workshop_expenses FOR DELETE
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

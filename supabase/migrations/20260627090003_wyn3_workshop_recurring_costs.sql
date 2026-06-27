-- WYN3 (Pack 3) — Szablony opłat cyklicznych + przypomnienia.
-- PO CO: definiujesz opłatę raz (czynsz/prąd/abonament): kwota, częstotliwość,
-- termin. System pokazuje nadchodzące i ostrzega kolorem (żółty 7 dni / czerwony
-- 3 dni — wzorzec OC/przegląd z Floty). Zatwierdzenie pozycji = wpis do
-- workshop_expenses (MVP: ręczne zatwierdzanie, bez crona).

CREATE TABLE IF NOT EXISTS public.workshop_recurring_costs (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id    uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  category       text        NOT NULL DEFAULT 'oplata' CHECK (category IN ('zakup','oplata','wyplata')),
  amount         numeric     NOT NULL CHECK (amount >= 0),
  frequency      text        NOT NULL CHECK (frequency IN ('weekly','monthly')),
  next_due_date  date        NOT NULL,
  end_date       date,
  default_method text        CHECK (default_method IN ('gotowka','karta','blik','przelew')),
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_recurring_provider ON public.workshop_recurring_costs(provider_id, active, next_due_date);

-- Dopinamy FK z wydatków do szablonu (kolumna powstała w WYN2).
ALTER TABLE public.workshop_expenses
  DROP CONSTRAINT IF EXISTS workshop_expenses_recurring_cost_id_fkey;
ALTER TABLE public.workshop_expenses
  ADD CONSTRAINT workshop_expenses_recurring_cost_id_fkey
  FOREIGN KEY (recurring_cost_id) REFERENCES public.workshop_recurring_costs(id) ON DELETE SET NULL;

ALTER TABLE public.workshop_recurring_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wrec_select ON public.workshop_recurring_costs;
DROP POLICY IF EXISTS wrec_insert ON public.workshop_recurring_costs;
DROP POLICY IF EXISTS wrec_update ON public.workshop_recurring_costs;
DROP POLICY IF EXISTS wrec_delete ON public.workshop_recurring_costs;

CREATE POLICY wrec_select ON public.workshop_recurring_costs FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wrec_insert ON public.workshop_recurring_costs FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wrec_update ON public.workshop_recurring_costs FOR UPDATE
  USING      (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wrec_delete ON public.workshop_recurring_costs FOR DELETE
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- WYN8: Zamknięcia miesiąca (archiwum raportów miesięcznych + reset kasy).
-- PO CO: domknięcie okresu jak w fizycznej kasie — zapis podsumowania do historii
-- i start nowego miesiąca od zera (reset = przesunięcie cash_started_at, bez kasowania
-- danych). Provider-scoped, RLS.
CREATE TABLE IF NOT EXISTS public.workshop_cash_closures (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id   uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  period_from   date,
  period_to     date,
  orders_count  integer     NOT NULL DEFAULT 0,
  revenue       numeric     NOT NULL DEFAULT 0,
  cost          numeric     NOT NULL DEFAULT 0,
  profit        numeric     NOT NULL DEFAULT 0,
  avg_margin    numeric     NOT NULL DEFAULT 0,
  expenses      numeric     NOT NULL DEFAULT 0,
  result        numeric     NOT NULL DEFAULT 0,
  cash_end      numeric     NOT NULL DEFAULT 0,
  closed_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workshop_closures_provider ON public.workshop_cash_closures(provider_id, closed_at);
ALTER TABLE public.workshop_cash_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wclo_select ON public.workshop_cash_closures;
DROP POLICY IF EXISTS wclo_insert ON public.workshop_cash_closures;
DROP POLICY IF EXISTS wclo_delete ON public.workshop_cash_closures;
CREATE POLICY wclo_select ON public.workshop_cash_closures FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wclo_insert ON public.workshop_cash_closures FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wclo_delete ON public.workshop_cash_closures FOR DELETE
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

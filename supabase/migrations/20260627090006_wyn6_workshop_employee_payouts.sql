-- WYN6 (Pack 4) — Wypłaty / zaliczki / premie pracowników.
-- PO CO: rejestr ile i kiedy pracownikowi wypłacono (pełna wypłata lub zaliczka)
-- oraz ręczne premie. Na koniec okresu: należy się (ze stawki × okres + premie) −
-- wypłacono = pozostało. Premia (type='premia') jest niezależna od grafiku/stawki.

CREATE TABLE IF NOT EXISTS public.workshop_employee_payouts (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id  uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  employee_id  uuid        NOT NULL REFERENCES public.workshop_employees(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('zaliczka','wyplata','premia')),
  amount       numeric     NOT NULL CHECK (amount >= 0),
  paid_at      timestamptz NOT NULL DEFAULT now(),
  period_start date,
  period_end   date,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_payouts_provider_day ON public.workshop_employee_payouts(provider_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_workshop_payouts_employee     ON public.workshop_employee_payouts(employee_id);

ALTER TABLE public.workshop_employee_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpay_out_select ON public.workshop_employee_payouts;
DROP POLICY IF EXISTS wpay_out_insert ON public.workshop_employee_payouts;
DROP POLICY IF EXISTS wpay_out_update ON public.workshop_employee_payouts;
DROP POLICY IF EXISTS wpay_out_delete ON public.workshop_employee_payouts;

CREATE POLICY wpay_out_select ON public.workshop_employee_payouts FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wpay_out_insert ON public.workshop_employee_payouts FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wpay_out_update ON public.workshop_employee_payouts FOR UPDATE
  USING      (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wpay_out_delete ON public.workshop_employee_payouts FOR DELETE
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

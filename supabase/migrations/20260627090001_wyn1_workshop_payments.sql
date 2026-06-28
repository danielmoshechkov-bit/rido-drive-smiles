-- WYN1 (Pack 1) — Płatności klienta przy zamknięciu zlecenia.
-- PO CO: rejestr jak klient zapłacił (gotówka/karta/BLIK/przelew), także podzielona
-- (kilka wierszy na to samo zlecenie). Zasila stan kasy i przepływ (Pack 5).
-- Scoping/RLS jak reszta warsztatu: per provider_id (service_providers.user_id).

CREATE TABLE IF NOT EXISTS public.workshop_payments (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id uuid        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  order_id    uuid        REFERENCES public.workshop_orders(id) ON DELETE CASCADE,
  invoice_id  uuid,                         -- pod płatności sprzedaży (Pack 2), nullable
  method      text        NOT NULL CHECK (method IN ('gotowka','karta','blik','przelew')),
  amount      numeric     NOT NULL CHECK (amount >= 0),
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_payments_order        ON public.workshop_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_workshop_payments_provider_day ON public.workshop_payments(provider_id, paid_at);

ALTER TABLE public.workshop_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wpay_select ON public.workshop_payments;
DROP POLICY IF EXISTS wpay_insert ON public.workshop_payments;
DROP POLICY IF EXISTS wpay_update ON public.workshop_payments;
DROP POLICY IF EXISTS wpay_delete ON public.workshop_payments;

CREATE POLICY wpay_select ON public.workshop_payments FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wpay_insert ON public.workshop_payments FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wpay_update ON public.workshop_payments FOR UPDATE
  USING      (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wpay_delete ON public.workshop_payments FOR DELETE
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

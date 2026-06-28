-- WYN5 (Pack 4/5) — Grafik warsztatu do normalizacji okresu pracownika.
-- PO CO: warsztat sam ustawia dni robocze (które dni tygodnia) i godziny (od–do).
-- Z tego liczymy normalizację stawki na okres (nie ze sztywnych 5 dni). Osobna
-- tabela provider-scoped (workshop_settings jest user-scoped i ma working_hours Json,
-- którego nie ruszamy). work_days: ISO 1=pon … 7=niedz.

CREATE TABLE IF NOT EXISTS public.workshop_finance_settings (
  provider_id uuid        NOT NULL PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  work_days   int[]       NOT NULL DEFAULT '{1,2,3,4,5}',
  work_start  time        NOT NULL DEFAULT '08:00',
  work_end    time        NOT NULL DEFAULT '16:00',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_finance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wfin_select ON public.workshop_finance_settings;
DROP POLICY IF EXISTS wfin_insert ON public.workshop_finance_settings;
DROP POLICY IF EXISTS wfin_update ON public.workshop_finance_settings;
DROP POLICY IF EXISTS wfin_delete ON public.workshop_finance_settings;

CREATE POLICY wfin_select ON public.workshop_finance_settings FOR SELECT
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wfin_insert ON public.workshop_finance_settings FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wfin_update ON public.workshop_finance_settings FOR UPDATE
  USING      (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY wfin_delete ON public.workshop_finance_settings FOR DELETE
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

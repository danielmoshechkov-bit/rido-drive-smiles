-- =====================================================================
-- WYN1 — Entitlementy per-firma: company_modules
-- Paczka 1 (fundament modularności). Migracja ADDYTYWNA.
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 1.1)
-- NIE rusza: service_bookings, vehicle_rentals, payments.
-- =====================================================================

-- ---- 0) Wspólny touch updated_at (nazwa lokalna, by nie nadpisać cudzego) ----
CREATE OR REPLACE FUNCTION public.rental_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---- 1) Tabela entitlementów per-firma -------------------------------
-- Warstwa 2 sprawdzenia uprawnień (patrz WYN3.can_use_module / company_module_enabled).
-- To jest REALNY gate per-firma: aby moduł działał, wiersz musi istnieć
-- i mieć enabled=true LUB aktywny trial_until.
CREATE TABLE IF NOT EXISTS public.company_modules (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key  text NOT NULL,                       -- 'rental'|'invoicing'|'payments'|'calendar'|'gielda'|'telematics'
  enabled     boolean NOT NULL DEFAULT false,
  trial_until timestamptz,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- per-moduł konfiguracja (np. reminder_days_before)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, module_key)
);

CREATE INDEX IF NOT EXISTS company_modules_company_idx
  ON public.company_modules(company_id);

CREATE TRIGGER trg_company_modules_touch
  BEFORE UPDATE ON public.company_modules
  FOR EACH ROW EXECUTE FUNCTION public.rental_touch_updated_at();

-- ---- 2) RLS: członek firmy czyta; właściciel/admin zarządza ----------
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_modules_select" ON public.company_modules
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    OR public.is_company_owner(company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "company_modules_insert" ON public.company_modules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_owner(company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "company_modules_update" ON public.company_modules
  FOR UPDATE TO authenticated
  USING (
    public.is_company_owner(company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_company_owner(company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "company_modules_delete" ON public.company_modules
  FOR DELETE TO authenticated
  USING (
    public.is_company_owner(company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- =====================================================================
-- WERYFIKACJA:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='company_modules' ORDER BY cmd;
-- =====================================================================

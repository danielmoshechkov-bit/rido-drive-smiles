-- =====================================================================
-- PARTER / KROK A2 — company_id na kotwicach domenowych (ADDYTYWNE)
-- ---------------------------------------------------------------------
-- Dodaje NULLABLE kolumnę company_id do 4 istniejących kotwic, wiążącą je
-- z firmą (companies). Kolumny zostają PUSTE (NULL) — backfill = A3.
--
-- ADDYTYWNE — gwarancje:
--  * Wyłącznie ADD COLUMN (nullable) + FK + indeks. Zero zmian w danych,
--    zero zmian w istniejących politykach RLS.
--  * Kolumna nullable → istniejące INSERT/UPDATE (które jej nie podają)
--    działają bez zmian. Żadna obecna polityka jej nie sprawdza.
--  * ON DELETE SET NULL → usunięcie firmy NIE kasuje kotwicy (bezpieczne).
--  * Nikt nie traci dostępu — czysta nowa kolumna obok.
-- =====================================================================

ALTER TABLE public.fleets
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.real_estate_agents
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fleets_company_id_idx             ON public.fleets(company_id);
CREATE INDEX IF NOT EXISTS service_providers_company_id_idx  ON public.service_providers(company_id);
CREATE INDEX IF NOT EXISTS real_estate_agents_company_id_idx ON public.real_estate_agents(company_id);
CREATE INDEX IF NOT EXISTS company_settings_company_id_idx   ON public.company_settings(company_id);

-- =====================================================================
-- WERYFIKACJA po wykonaniu:
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema='public' AND column_name='company_id'
--     AND table_name IN ('fleets','service_providers','real_estate_agents','company_settings')
--   ORDER BY table_name;   -- oczekiwane: 4 wiersze
--   SELECT count(*) FROM public.fleets WHERE company_id IS NOT NULL;  -- 0 (backfill = A3)
-- =====================================================================

-- =====================================================================
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.fleets_company_id_idx;
--   DROP INDEX IF EXISTS public.service_providers_company_id_idx;
--   DROP INDEX IF EXISTS public.real_estate_agents_company_id_idx;
--   DROP INDEX IF EXISTS public.company_settings_company_id_idx;
--   ALTER TABLE public.fleets             DROP COLUMN IF EXISTS company_id;
--   ALTER TABLE public.service_providers  DROP COLUMN IF EXISTS company_id;
--   ALTER TABLE public.real_estate_agents DROP COLUMN IF EXISTS company_id;
--   ALTER TABLE public.company_settings   DROP COLUMN IF EXISTS company_id;
-- =====================================================================

-- =====================================================================
-- PARTER / KROK A1 — encje firmy (ADDYTYWNE)
-- ---------------------------------------------------------------------
-- Tworzy DWIE nowe tabele (companies, company_members) + 2 helpery RLS
-- (SECURITY DEFINER, by uniknąć wzajemnej rekurencji polityk).
--
-- ADDYTYWNE — gwarancje:
--  * Tylko CREATE (nowe obiekty). Zero ALTER/DROP na istniejących tabelach.
--  * Nie dotyka app_role / user_roles / has_role ani żadnej istniejącej polityki.
--  * Nikt nie traci dostępu — to czysta nowa warstwa obok.
--  * Backfill danych = OSOBNY krok (A3), tu tabele są PUSTE.
-- =====================================================================

-- ---- 1) companies ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  nip            text,
  owner_user_id  uuid NOT NULL,                 -- konto-założyciel (główny właściciel)
  type           text NOT NULL DEFAULT 'other', -- 'workshop'|'fleet'|'agency'|'mixed'|'other' (informacyjnie)
  status         text NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS companies_owner_user_id_idx ON public.companies(owner_user_id);

-- ---- 2) company_members --------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  is_owner    boolean NOT NULL DEFAULT false,
  status      text NOT NULL DEFAULT 'active',   -- 'active'|'invited' (spójne z workspace_project_members)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS company_members_user_id_idx    ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS company_members_company_id_idx ON public.company_members(company_id);

-- ---- 3) Helpery RLS (SECURITY DEFINER → brak wzajemnej rekurencji) ---
CREATE OR REPLACE FUNCTION public.is_company_owner(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND owner_user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM company_members
                 WHERE company_id = p_company_id AND user_id = auth.uid() AND status = 'active');
$$;

GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

-- ---- 4) RLS: companies (owner / członek / admin) --------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select" ON public.companies
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR is_company_member(id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "companies_insert" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "companies_update" ON public.companies
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (owner_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "companies_delete" ON public.companies
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- ---- 5) RLS: company_members (self / właściciel firmy / admin) ------
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select" ON public.company_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_company_owner(company_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_members_insert" ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (is_company_owner(company_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_members_update" ON public.company_members
  FOR UPDATE TO authenticated
  USING (is_company_owner(company_id) OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_company_owner(company_id) OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_members_delete" ON public.company_members
  FOR DELETE TO authenticated
  USING (is_company_owner(company_id) OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- WERYFIKACJA po wykonaniu:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('companies','company_members')
--   ORDER BY tablename, cmd;
--   SELECT count(*) FROM companies;        -- 0 (puste, backfill = A3)
--   SELECT count(*) FROM company_members;  -- 0
-- =====================================================================

-- =====================================================================
-- ROLLBACK (pełny, bez śladu — addytywne):
--   DROP TABLE IF EXISTS public.company_members CASCADE;
--   DROP TABLE IF EXISTS public.companies CASCADE;
--   DROP FUNCTION IF EXISTS public.is_company_owner(uuid);
--   DROP FUNCTION IF EXISTS public.is_company_member(uuid);
-- =====================================================================

-- get_my_invited_projects: RPC zwracający zaproszenia (z NAZWĄ projektu) dla bieżącego usera
-- ---------------------------------------------------------------------
-- Problem „Nieznany projekt": RLS workspace_projects (ws_projects_select)
-- wpuszcza tylko owner LUB is_workspace_project_member() = status='active'.
-- Zaproszony (status='invited') NIE przeczyta workspace_projects.name → front
-- pokazywał „Nieznany projekt".
--
-- Rozwiązanie ADDYTYWNE: SECURITY DEFINER RPC, które zwraca zaproszenia
-- bieżącego usera (po user_id LUB email) wraz z nazwą projektu — omija RLS
-- tylko dla wierszy, do których user JEST realnie zaproszony. Zero zmian w
-- istniejących politykach/funkcjach.

CREATE OR REPLACE FUNCTION public.get_my_invited_projects()
RETURNS TABLE(member_id uuid, project_id uuid, project_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.project_id, p.name, m.created_at
  FROM workspace_project_members m
  JOIN workspace_projects p ON p.id = m.project_id
  WHERE m.status = 'invited'
    AND (m.user_id = auth.uid() OR m.email = auth.email());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_invited_projects() TO authenticated;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_my_invited_projects();

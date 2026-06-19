-- FIX 3 — Przypisanie zadań na user_id + domknięcie write-leaku na assignees
-- ---------------------------------------------------------------------------
-- Część A: pas bezpieczeństwa w workspace_tasks SELECT — przypisany (user_id)
--          widzi zadanie, nawet jeśli nie jest pełnym członkiem projektu (additywne).
-- Część A2: workspace_task_assignees miało SELECT/INSERT/DELETE = true
--          (każdy czytał i wpisywał/usuwał cudze przypisania) → ograniczamy do
--          owner/member projektu zadania.
--
-- UWAGA RECURSION: polityki tasks i assignees odwołują się do siebie nawzajem.
-- Aby uniknąć "infinite recursion detected in policy", inter-tabelowe sprawdzenia
-- robimy przez funkcje SECURITY DEFINER (czytają z pominięciem RLS), co przerywa cykl.
-- Zmiana dotyczy tylko polityk RLS. Brak migracji danych (backfill pominięty).

-- ── Funkcje pomocnicze (SECURITY DEFINER, bez RLS — przerywają rekurencję) ──
CREATE OR REPLACE FUNCTION public.is_workspace_task_assignee(p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_task_assignees a
    WHERE a.task_id = p_task_id AND a.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace_task_project(p_task_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_tasks t
    WHERE t.id = p_task_id
      AND (
        t.project_id IN (SELECT get_workspace_owned_project_ids())
        OR t.project_id IN (SELECT get_workspace_member_project_ids())
      )
  );
$$;

-- ── Część A: pas bezpieczeństwa w workspace_tasks SELECT (additywny) ──
DROP POLICY IF EXISTS "ws_tasks_select" ON public.workspace_tasks;
CREATE POLICY "ws_tasks_select" ON public.workspace_tasks
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT get_workspace_owned_project_ids())
    OR project_id IN (SELECT get_workspace_member_project_ids())
    OR assigned_user_id = auth.uid()                 -- przypisany pojedynczo (kolumna na tasku)
    OR is_workspace_task_assignee(id)                -- przypisany multi (tabela; bez rekurencji)
  );

-- ── Część A2: domknięcie workspace_task_assignees (owner/member projektu zadania) ──
DROP POLICY IF EXISTS "Assignees visible" ON public.workspace_task_assignees;
CREATE POLICY "Assignees visible" ON public.workspace_task_assignees
  FOR SELECT TO authenticated
  USING ( user_id = auth.uid() OR can_access_workspace_task_project(task_id) );

DROP POLICY IF EXISTS "Assignees insert" ON public.workspace_task_assignees;
CREATE POLICY "Assignees insert" ON public.workspace_task_assignees
  FOR INSERT TO authenticated
  WITH CHECK ( can_access_workspace_task_project(task_id) );

DROP POLICY IF EXISTS "Assignees delete" ON public.workspace_task_assignees;
CREATE POLICY "Assignees delete" ON public.workspace_task_assignees
  FOR DELETE TO authenticated
  USING ( can_access_workspace_task_project(task_id) );

-- =========================================================================
-- ROLLBACK (odwrócenie — przywraca dokładnie stan sprzed FIX 3):
-- =========================================================================
-- DROP POLICY IF EXISTS "ws_tasks_select" ON public.workspace_tasks;
-- CREATE POLICY "ws_tasks_select" ON public.workspace_tasks FOR SELECT TO authenticated
--   USING ( project_id IN (SELECT get_workspace_owned_project_ids())
--        OR project_id IN (SELECT get_workspace_member_project_ids()) );
-- DROP POLICY IF EXISTS "Assignees visible" ON public.workspace_task_assignees;
-- CREATE POLICY "Assignees visible" ON public.workspace_task_assignees FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS "Assignees insert" ON public.workspace_task_assignees;
-- CREATE POLICY "Assignees insert" ON public.workspace_task_assignees FOR INSERT TO authenticated WITH CHECK (true);
-- DROP POLICY IF EXISTS "Assignees delete" ON public.workspace_task_assignees;
-- CREATE POLICY "Assignees delete" ON public.workspace_task_assignees FOR DELETE TO authenticated USING (true);
-- DROP FUNCTION IF EXISTS public.is_workspace_task_assignee(uuid);
-- DROP FUNCTION IF EXISTS public.can_access_workspace_task_project(uuid);

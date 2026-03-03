
-- Fix infinite recursion in workspace RLS policies
-- Use SECURITY DEFINER functions to break the cycle

-- Function to check if user owns a project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_projects
    WHERE id = p_project_id AND owner_user_id = auth.uid()
  )
$$;

-- Function to check if user is a member of a project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_project_members
    WHERE project_id = p_project_id AND user_id = auth.uid() AND status = 'active'
  )
$$;

-- Function to get all project IDs user owns
CREATE OR REPLACE FUNCTION public.get_workspace_owned_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
$$;

-- Function to get all project IDs user is member of
CREATE OR REPLACE FUNCTION public.get_workspace_member_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND status = 'active'
$$;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users see own projects" ON public.workspace_projects;
DROP POLICY IF EXISTS "Users create own projects" ON public.workspace_projects;
DROP POLICY IF EXISTS "Owners update projects" ON public.workspace_projects;
DROP POLICY IF EXISTS "Owners delete projects" ON public.workspace_projects;

DROP POLICY IF EXISTS "Members see project members" ON public.workspace_project_members;
DROP POLICY IF EXISTS "Project owners manage members" ON public.workspace_project_members;
DROP POLICY IF EXISTS "Project owners update members" ON public.workspace_project_members;
DROP POLICY IF EXISTS "Project owners delete members" ON public.workspace_project_members;

DROP POLICY IF EXISTS "Users see tasks in their projects" ON public.workspace_tasks;
DROP POLICY IF EXISTS "Users create tasks" ON public.workspace_tasks;
DROP POLICY IF EXISTS "Users update tasks" ON public.workspace_tasks;
DROP POLICY IF EXISTS "Users delete tasks" ON public.workspace_tasks;

DROP POLICY IF EXISTS "Users see messages" ON public.workspace_messages;
DROP POLICY IF EXISTS "Users send messages" ON public.workspace_messages;

DROP POLICY IF EXISTS "Users see channels" ON public.workspace_channels;
DROP POLICY IF EXISTS "Users create channels" ON public.workspace_channels;

DROP POLICY IF EXISTS "Users see task comments" ON public.workspace_task_comments;
DROP POLICY IF EXISTS "Users add comments" ON public.workspace_task_comments;

DROP POLICY IF EXISTS "Users see invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Owners create invitations" ON public.workspace_invitations;

-- Recreate policies using SECURITY DEFINER functions (no recursion)

-- workspace_projects
CREATE POLICY "ws_projects_select" ON public.workspace_projects
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_workspace_project_member(id));

CREATE POLICY "ws_projects_insert" ON public.workspace_projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "ws_projects_update" ON public.workspace_projects
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "ws_projects_delete" ON public.workspace_projects
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- workspace_project_members
CREATE POLICY "ws_members_select" ON public.workspace_project_members
  FOR SELECT TO authenticated
  USING (public.is_workspace_project_owner(project_id) OR user_id = auth.uid());

CREATE POLICY "ws_members_insert" ON public.workspace_project_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_project_owner(project_id));

CREATE POLICY "ws_members_update" ON public.workspace_project_members
  FOR UPDATE TO authenticated
  USING (public.is_workspace_project_owner(project_id));

CREATE POLICY "ws_members_delete" ON public.workspace_project_members
  FOR DELETE TO authenticated
  USING (public.is_workspace_project_owner(project_id));

-- workspace_tasks
CREATE POLICY "ws_tasks_select" ON public.workspace_tasks
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

CREATE POLICY "ws_tasks_insert" ON public.workspace_tasks
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

CREATE POLICY "ws_tasks_update" ON public.workspace_tasks
  FOR UPDATE TO authenticated
  USING (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

CREATE POLICY "ws_tasks_delete" ON public.workspace_tasks
  FOR DELETE TO authenticated
  USING (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

-- workspace_messages
CREATE POLICY "ws_messages_select" ON public.workspace_messages
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

CREATE POLICY "ws_messages_insert" ON public.workspace_messages
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

-- workspace_channels
CREATE POLICY "ws_channels_select" ON public.workspace_channels
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

CREATE POLICY "ws_channels_insert" ON public.workspace_channels
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids()));

-- workspace_task_comments
CREATE POLICY "ws_comments_select" ON public.workspace_task_comments
  FOR SELECT TO authenticated
  USING (task_id IN (SELECT id FROM workspace_tasks WHERE project_id IN (SELECT public.get_workspace_owned_project_ids()) OR project_id IN (SELECT public.get_workspace_member_project_ids())));

CREATE POLICY "ws_comments_insert" ON public.workspace_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- workspace_invitations
CREATE POLICY "ws_invitations_select" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT public.get_workspace_owned_project_ids()) OR email = (auth.jwt()->>'email'));

CREATE POLICY "ws_invitations_insert" ON public.workspace_invitations
  FOR INSERT TO authenticated
  WITH CHECK (project_id IN (SELECT public.get_workspace_owned_project_ids()));

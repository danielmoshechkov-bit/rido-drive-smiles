-- Allow invited users to see their own invitations by email
DROP POLICY IF EXISTS ws_members_select ON workspace_project_members;
CREATE POLICY ws_members_select ON workspace_project_members FOR SELECT USING (
  is_workspace_project_owner(project_id) 
  OR (user_id = auth.uid())
  OR (status = 'invited' AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- Allow invited users to accept their own invitation (update status, set user_id)
DROP POLICY IF EXISTS ws_members_update ON workspace_project_members;
CREATE POLICY ws_members_update ON workspace_project_members FOR UPDATE USING (
  is_workspace_project_owner(project_id)
  OR (status = 'invited' AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
);

-- Allow invited users to decline (delete) their own invitation
DROP POLICY IF EXISTS ws_members_delete ON workspace_project_members;
CREATE POLICY ws_members_delete ON workspace_project_members FOR DELETE USING (
  is_workspace_project_owner(project_id)
  OR (status = 'invited' AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
);
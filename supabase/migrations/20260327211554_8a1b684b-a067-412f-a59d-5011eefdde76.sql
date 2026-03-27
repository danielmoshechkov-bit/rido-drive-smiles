-- Add columns for better team management
ALTER TABLE workspace_project_members 
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'pl',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS invited_by TEXT;

-- Project invitations with tokens for link-based invites
CREATE TABLE IF NOT EXISTS workspace_project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES workspace_projects(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'member',
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status TEXT DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token)
);

ALTER TABLE workspace_project_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage invitations for their projects" ON workspace_project_invitations
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
      UNION
      SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
      UNION
      SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  );

-- Allow reading own invitations (by email)
CREATE POLICY "Users can see invitations sent to them" ON workspace_project_invitations
  FOR SELECT TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
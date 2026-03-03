
-- Feature flag for workspace
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES ('ai_workspace_enabled', 'Workspace / Task Manager', 'Moduł Workspace z projektami, zadaniami, komunikacją i AI Plannerem', false, 'general')
ON CONFLICT DO NOTHING;

-- Create all tables first (no RLS yet)
CREATE TABLE public.workspace_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  color TEXT DEFAULT '#6C4AE2',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES workspace_projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID,
  email TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES workspace_projects(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_user_id UUID,
  assigned_name TEXT,
  created_by UUID NOT NULL,
  due_date TIMESTAMPTZ,
  parent_task_id UUID REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  order_index INT DEFAULT 0,
  color TEXT DEFAULT '#6C4AE2',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES workspace_tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES workspace_tasks(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES workspace_projects(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES workspace_projects(id) ON DELETE CASCADE NOT NULL,
  channel_name TEXT NOT NULL DEFAULT 'general',
  user_id UUID NOT NULL,
  user_name TEXT,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  file_url TEXT,
  file_name TEXT,
  file_size INT,
  reply_to_id UUID REFERENCES workspace_messages(id),
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.workspace_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES workspace_projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Now enable RLS on all tables
ALTER TABLE public.workspace_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_channels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users see own projects" ON public.workspace_projects
  FOR SELECT USING (owner_user_id = auth.uid() OR id IN (
    SELECT project_id FROM public.workspace_project_members WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "Users create own projects" ON public.workspace_projects
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owners update projects" ON public.workspace_projects
  FOR UPDATE USING (owner_user_id = auth.uid());
CREATE POLICY "Owners delete projects" ON public.workspace_projects
  FOR DELETE USING (owner_user_id = auth.uid());

CREATE POLICY "Members see project members" ON public.workspace_project_members
  FOR SELECT USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
    OR user_id = auth.uid()
  );
CREATE POLICY "Project owners manage members" ON public.workspace_project_members
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
  );
CREATE POLICY "Project owners update members" ON public.workspace_project_members
  FOR UPDATE USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
  );
CREATE POLICY "Project owners delete members" ON public.workspace_project_members
  FOR DELETE USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Users see tasks in their projects" ON public.workspace_tasks
  FOR SELECT USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
    OR project_id IN (SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Users create tasks" ON public.workspace_tasks
  FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users update tasks" ON public.workspace_tasks
  FOR UPDATE USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
    OR project_id IN (SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Users delete own tasks" ON public.workspace_tasks
  FOR DELETE USING (created_by = auth.uid());

CREATE POLICY "Users see comments" ON public.workspace_task_comments
  FOR SELECT USING (task_id IN (SELECT id FROM workspace_tasks));
CREATE POLICY "Users create comments" ON public.workspace_task_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users see history" ON public.workspace_task_history
  FOR SELECT USING (task_id IN (SELECT id FROM workspace_tasks));
CREATE POLICY "System inserts history" ON public.workspace_task_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users see own invitations" ON public.workspace_invitations
  FOR SELECT USING (invited_by = auth.uid());
CREATE POLICY "Users create invitations" ON public.workspace_invitations
  FOR INSERT WITH CHECK (invited_by = auth.uid());

CREATE POLICY "Users see messages" ON public.workspace_messages
  FOR SELECT USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
    OR project_id IN (SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Users send messages" ON public.workspace_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own messages" ON public.workspace_messages
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users see channels" ON public.workspace_channels
  FOR SELECT USING (
    project_id IN (SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid())
    OR project_id IN (SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Users create channels" ON public.workspace_channels
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Triggers
CREATE TRIGGER update_workspace_projects_updated_at
  BEFORE UPDATE ON public.workspace_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspace_tasks_updated_at
  BEFORE UPDATE ON public.workspace_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('workspace-files', 'workspace-files', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Auth users upload workspace files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'workspace-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "View workspace files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'workspace-files');

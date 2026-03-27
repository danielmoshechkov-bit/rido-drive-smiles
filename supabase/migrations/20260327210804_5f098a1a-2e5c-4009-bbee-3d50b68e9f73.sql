-- Add task_number, time tracking, and dependency columns to workspace_tasks
ALTER TABLE workspace_tasks 
  ADD COLUMN IF NOT EXISTS task_number SERIAL,
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS time_logged_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_by_task_id UUID REFERENCES workspace_tasks(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Time tracking entries
CREATE TABLE IF NOT EXISTS workspace_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workspace_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage time entries" ON workspace_time_entries
  FOR ALL TO authenticated
  USING (
    task_id IN (
      SELECT id FROM workspace_tasks WHERE project_id IN (
        SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
        UNION
        SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    task_id IN (
      SELECT id FROM workspace_tasks WHERE project_id IN (
        SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
        UNION
        SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Task dependencies table (many-to-many)
CREATE TABLE IF NOT EXISTS workspace_task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT DEFAULT 'blocks',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, depends_on_task_id)
);

ALTER TABLE workspace_task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage task dependencies" ON workspace_task_dependencies
  FOR ALL TO authenticated
  USING (
    task_id IN (
      SELECT id FROM workspace_tasks WHERE project_id IN (
        SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
        UNION
        SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  )
  WITH CHECK (
    task_id IN (
      SELECT id FROM workspace_tasks WHERE project_id IN (
        SELECT id FROM workspace_projects WHERE owner_user_id = auth.uid()
        UNION
        SELECT project_id FROM workspace_project_members WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );
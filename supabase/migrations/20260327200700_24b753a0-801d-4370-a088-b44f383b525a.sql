
-- Message reactions
CREATE TABLE IF NOT EXISTS workspace_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES workspace_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE workspace_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions" ON workspace_message_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can add reactions" ON workspace_message_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions" ON workspace_message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add type to workspace_channels
ALTER TABLE workspace_channels ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'public';
ALTER TABLE workspace_channels ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- DM/Group channel participants
CREATE TABLE IF NOT EXISTS workspace_channel_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES workspace_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE workspace_channel_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view channel participations" ON workspace_channel_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own participation" ON workspace_channel_participants
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Members can add participants" ON workspace_channel_participants
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Members can remove participants" ON workspace_channel_participants
  FOR DELETE TO authenticated USING (true);

-- Add thread_parent_id and channel_id to workspace_messages
ALTER TABLE workspace_messages ADD COLUMN IF NOT EXISTS thread_parent_id uuid REFERENCES workspace_messages(id) ON DELETE SET NULL;
ALTER TABLE workspace_messages ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES workspace_channels(id) ON DELETE CASCADE;

-- Task subtasks / checklist
CREATE TABLE IF NOT EXISTS workspace_task_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_completed boolean DEFAULT false,
  completed_by uuid REFERENCES auth.users(id),
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_task_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Checklist visible to auth" ON workspace_task_checklist
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Checklist insert by auth" ON workspace_task_checklist
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Checklist update by auth" ON workspace_task_checklist
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Checklist delete by auth" ON workspace_task_checklist
  FOR DELETE TO authenticated USING (true);

-- Task change history
CREATE TABLE IF NOT EXISTS workspace_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  user_name text,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_task_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Task history visible" ON workspace_task_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Task history insert" ON workspace_task_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Multi-assign for tasks
CREATE TABLE IF NOT EXISTS workspace_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  member_id uuid REFERENCES workspace_project_members(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignees visible" ON workspace_task_assignees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Assignees insert" ON workspace_task_assignees
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Assignees delete" ON workspace_task_assignees
  FOR DELETE TO authenticated USING (true);

-- Workspace notifications
CREATE TABLE IF NOT EXISTS workspace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES workspace_projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workspace_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON workspace_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert notifications" ON workspace_notifications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON workspace_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Add hierarchy role and online status to members
ALTER TABLE workspace_project_members ADD COLUMN IF NOT EXISTS hierarchy_role text DEFAULT 'member';
ALTER TABLE workspace_project_members ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE workspace_project_members ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ws_reactions_message ON workspace_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_ws_channel_participants ON workspace_channel_participants(channel_id);
CREATE INDEX IF NOT EXISTS idx_ws_task_checklist ON workspace_task_checklist(task_id);
CREATE INDEX IF NOT EXISTS idx_ws_task_history ON workspace_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_ws_task_assignees ON workspace_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_ws_notifications_user ON workspace_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_ws_messages_thread ON workspace_messages(thread_parent_id);
CREATE INDEX IF NOT EXISTS idx_ws_messages_channel_id ON workspace_messages(channel_id);

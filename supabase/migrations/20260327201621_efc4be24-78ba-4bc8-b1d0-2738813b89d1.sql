
-- User workspace settings for status and preferences
CREATE TABLE IF NOT EXISTS user_workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  preferred_language text DEFAULT 'pl',
  status text DEFAULT 'available', -- available, away, dnd, offline
  status_text text,
  status_emoji text,
  focus_mode boolean DEFAULT false,
  notification_preferences jsonb DEFAULT '{"mentions": true, "threads": true, "tasks": true, "deadline_1d": true, "deadline_1h": true}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings" ON user_workspace_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Others can view settings" ON user_workspace_settings
  FOR SELECT TO authenticated USING (true);

-- Add is_edited and edited_at to workspace_messages
ALTER TABLE workspace_messages ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;
ALTER TABLE workspace_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE workspace_messages ADD COLUMN IF NOT EXISTS original_content text;

-- Message pins table (separate from is_pinned flag for better querying)
CREATE TABLE IF NOT EXISTS workspace_message_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES workspace_channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES workspace_messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id)
);

ALTER TABLE workspace_message_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pins visible" ON workspace_message_pins
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pins insert" ON workspace_message_pins
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Pins delete" ON workspace_message_pins
  FOR DELETE TO authenticated USING (true);

-- Index for settings
CREATE INDEX IF NOT EXISTS idx_user_workspace_settings_user ON user_workspace_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_message_pins_channel ON workspace_message_pins(channel_id);

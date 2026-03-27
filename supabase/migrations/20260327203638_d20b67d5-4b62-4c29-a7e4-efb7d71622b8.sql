-- Drop old workspace_notifications if exists and recreate with new schema
DROP TABLE IF EXISTS public.workspace_notifications CASCADE;

CREATE TABLE public.workspace_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link_type text,
  link_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  sender_user_id uuid,
  sender_name text
);

CREATE INDEX idx_workspace_notifications_user ON public.workspace_notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_workspace_notifications_project ON public.workspace_notifications(project_id);

ALTER TABLE public.workspace_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.workspace_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.workspace_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notifications"
  ON public.workspace_notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can insert notifications"
  ON public.workspace_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
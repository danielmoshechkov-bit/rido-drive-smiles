CREATE TABLE public.workspace_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.workspace_projects(id) ON DELETE CASCADE NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  trigger_type text NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  last_triggered_at timestamptz,
  trigger_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.workspace_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.workspace_automations(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.workspace_projects(id) ON DELETE CASCADE NOT NULL,
  trigger_data jsonb DEFAULT '{}'::jsonb,
  actions_executed jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'success',
  error_message text,
  executed_at timestamptz DEFAULT now()
);

ALTER TABLE public.workspace_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage automations" ON public.workspace_automations
  FOR ALL TO authenticated
  USING (
    project_id IN (SELECT public.get_workspace_owned_project_ids())
    OR project_id IN (SELECT public.get_workspace_member_project_ids())
  )
  WITH CHECK (
    project_id IN (SELECT public.get_workspace_owned_project_ids())
    OR project_id IN (SELECT public.get_workspace_member_project_ids())
  );

CREATE POLICY "Members can view automation logs" ON public.workspace_automation_logs
  FOR SELECT TO authenticated
  USING (
    project_id IN (SELECT public.get_workspace_owned_project_ids())
    OR project_id IN (SELECT public.get_workspace_member_project_ids())
  );

CREATE POLICY "System can insert logs" ON public.workspace_automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    project_id IN (SELECT public.get_workspace_owned_project_ids())
    OR project_id IN (SELECT public.get_workspace_member_project_ids())
  );

CREATE TRIGGER set_workspace_automations_updated_at
  BEFORE UPDATE ON public.workspace_automations
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
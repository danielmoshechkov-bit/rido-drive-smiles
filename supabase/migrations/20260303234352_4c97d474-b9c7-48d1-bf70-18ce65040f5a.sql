
-- Add extra columns to workspace_project_members for invitation details
ALTER TABLE public.workspace_project_members 
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text;


-- Workspace email whitelist table
CREATE TABLE public.workspace_email_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_email_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workspace whitelist"
ON public.workspace_email_whitelist
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert warsztat@test.pl
INSERT INTO public.workspace_email_whitelist (email) VALUES ('warsztat@test.pl');

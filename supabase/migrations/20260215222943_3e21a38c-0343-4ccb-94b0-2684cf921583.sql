
-- Create support_ticket_whitelist table (referenced by widget but didn't exist)
CREATE TABLE IF NOT EXISTS public.support_ticket_whitelist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_ticket_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage whitelist" ON public.support_ticket_whitelist
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read active whitelist" ON public.support_ticket_whitelist
  FOR SELECT USING (is_active = true);

-- Seed default whitelisted emails
INSERT INTO public.support_ticket_whitelist (email) VALUES
  ('daniel.moshechkov@gmail.com'),
  ('anastasiia.shapovalova1991@gmail.com'),
  ('piotrkrolakartcom@o2.pl')
ON CONFLICT (email) DO NOTHING;

-- Add salary column to workshop_employees
ALTER TABLE public.workshop_employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.workshop_employees ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.workshop_employees ADD COLUMN IF NOT EXISTS salary NUMERIC;

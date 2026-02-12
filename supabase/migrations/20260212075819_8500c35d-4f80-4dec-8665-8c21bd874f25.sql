
-- Whitelist: emails allowed to use the ticket chat
CREATE TABLE public.ticket_chat_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_chat_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage whitelist"
ON public.ticket_chat_whitelist
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Support tickets table
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by UUID REFERENCES auth.users(id) NOT NULL,
  submitted_by_email TEXT,
  description TEXT NOT NULL,
  screenshot_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected', 'completed')),
  ai_repair_prompt TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can see their own tickets
CREATE POLICY "Users can view own tickets"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (submitted_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Whitelisted users can create tickets
CREATE POLICY "Whitelisted users can create tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (submitted_by = auth.uid());

-- Admins can update tickets
CREATE POLICY "Admins can update tickets"
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for ticket screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-screenshots', 'ticket-screenshots', true);

CREATE POLICY "Authenticated users can upload ticket screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-screenshots');

CREATE POLICY "Anyone can view ticket screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-screenshots');

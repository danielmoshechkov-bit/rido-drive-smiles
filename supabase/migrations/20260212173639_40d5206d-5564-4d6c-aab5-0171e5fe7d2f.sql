-- Fix whitelist RLS: drop ALL policy and create separate ones with explicit WITH CHECK
DROP POLICY IF EXISTS "Admins can manage whitelist" ON public.ticket_chat_whitelist;

CREATE POLICY "Admins can select whitelist"
ON public.ticket_chat_whitelist
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert whitelist"
ON public.ticket_chat_whitelist
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete whitelist"
ON public.ticket_chat_whitelist
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Also fix support_tickets: admins should be able to SELECT all
DROP POLICY IF EXISTS "Admins can read all tickets" ON public.support_tickets;
CREATE POLICY "Admins can read all tickets"
ON public.support_tickets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete tickets too
DROP POLICY IF EXISTS "Admins can delete tickets" ON public.support_tickets;
CREATE POLICY "Admins can delete tickets"
ON public.support_tickets
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
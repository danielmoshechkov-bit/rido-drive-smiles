-- Allow fleet_settlement users to manage whitelist too
DROP POLICY IF EXISTS "Admins can select whitelist" ON public.ticket_chat_whitelist;
DROP POLICY IF EXISTS "Admins can insert whitelist" ON public.ticket_chat_whitelist;
DROP POLICY IF EXISTS "Admins can delete whitelist" ON public.ticket_chat_whitelist;

CREATE POLICY "Admins and fleet can select whitelist"
ON public.ticket_chat_whitelist
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fleet_settlement'::app_role));

CREATE POLICY "Admins and fleet can insert whitelist"
ON public.ticket_chat_whitelist
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fleet_settlement'::app_role));

CREATE POLICY "Admins and fleet can delete whitelist"
ON public.ticket_chat_whitelist
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fleet_settlement'::app_role));

-- Also allow fleet_settlement to read and manage support tickets
DROP POLICY IF EXISTS "Admins can read all tickets" ON public.support_tickets;
CREATE POLICY "Admins and fleet can read all tickets"
ON public.support_tickets
FOR SELECT
USING (submitted_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fleet_settlement'::app_role));

DROP POLICY IF EXISTS "Admins can update tickets" ON public.support_tickets;
CREATE POLICY "Admins and fleet can update tickets"
ON public.support_tickets
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fleet_settlement'::app_role));

DROP POLICY IF EXISTS "Admins can delete tickets" ON public.support_tickets;
CREATE POLICY "Admins and fleet can delete tickets"
ON public.support_tickets
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'fleet_settlement'::app_role));
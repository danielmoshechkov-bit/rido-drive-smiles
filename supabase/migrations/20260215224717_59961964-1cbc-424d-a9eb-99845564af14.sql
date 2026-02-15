
-- Create a SECURITY DEFINER function to get provider IDs for user
CREATE OR REPLACE FUNCTION public.get_user_provider_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM service_providers WHERE user_id = p_user_id
$$;

-- Fix workshop_employees RLS
DROP POLICY IF EXISTS "Providers manage own employees" ON workshop_employees;
CREATE POLICY "Providers manage own employees" ON workshop_employees
  FOR ALL
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())))
  WITH CHECK (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

-- Fix workshop_workstations RLS
DROP POLICY IF EXISTS "Workstations by provider" ON workshop_workstations;
CREATE POLICY "Workstations by provider" ON workshop_workstations
  FOR ALL
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())))
  WITH CHECK (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

-- Fix provider_services RLS
DROP POLICY IF EXISTS "Providers manage own services" ON provider_services;
CREATE POLICY "Providers manage own services" ON provider_services
  FOR ALL
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())))
  WITH CHECK (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

-- Fix support_tickets INSERT policy - ensure submitted_by matches auth.uid()
DROP POLICY IF EXISTS "Whitelisted users can create tickets" ON support_tickets;
CREATE POLICY "Authenticated users can create tickets" ON support_tickets
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

-- Fix calendar_calendars - add provider-based ownership
DROP POLICY IF EXISTS "Users can create own calendars" ON calendar_calendars;
CREATE POLICY "Users can create own calendars" ON calendar_calendars
  FOR INSERT
  WITH CHECK (
    (owner_type = 'user' AND owner_id = auth.uid())
    OR
    (owner_type = 'provider' AND owner_id::text IN (SELECT get_user_provider_ids(auth.uid())::text))
  );

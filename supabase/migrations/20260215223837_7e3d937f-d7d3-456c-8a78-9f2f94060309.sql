
-- Fix RLS policies for workshop_employees - add explicit WITH CHECK
DROP POLICY IF EXISTS "Providers manage own employees" ON workshop_employees;
CREATE POLICY "Providers manage own employees" ON workshop_employees
  FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Fix RLS policies for workshop_workstations - add explicit WITH CHECK
DROP POLICY IF EXISTS "Workstations by provider" ON workshop_workstations;
CREATE POLICY "Workstations by provider" ON workshop_workstations
  FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

-- Fix RLS policies for provider_services - add explicit WITH CHECK
DROP POLICY IF EXISTS "Providers manage own services" ON provider_services;
CREATE POLICY "Providers manage own services" ON provider_services
  FOR ALL
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid()));

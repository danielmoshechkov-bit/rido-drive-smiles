
-- Fix workshop_employees RLS - use direct subquery instead of function
DROP POLICY IF EXISTS "Providers manage own employees" ON workshop_employees;

CREATE POLICY "Providers can read own employees" ON workshop_employees
  FOR SELECT USING (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can insert own employees" ON workshop_employees
  FOR INSERT WITH CHECK (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can update own employees" ON workshop_employees
  FOR UPDATE USING (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can delete own employees" ON workshop_employees
  FOR DELETE USING (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

-- Same fix for workshop_workstations
DROP POLICY IF EXISTS "Providers manage own workstations" ON workshop_workstations;

CREATE POLICY "Providers can read own workstations" ON workshop_workstations
  FOR SELECT USING (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can insert own workstations" ON workshop_workstations
  FOR INSERT WITH CHECK (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can update own workstations" ON workshop_workstations
  FOR UPDATE USING (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

CREATE POLICY "Providers can delete own workstations" ON workshop_workstations
  FOR DELETE USING (
    provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
  );

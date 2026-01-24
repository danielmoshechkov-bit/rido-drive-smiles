-- Drop the conflicting policy first
DROP POLICY IF EXISTS "Admins can view all entities" ON entities;
DROP POLICY IF EXISTS "Assigned accountants can view entities" ON entities;

-- Recreate the admin access policy
CREATE POLICY "Admins can view all entities"
ON entities FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow accounting assignments access
CREATE POLICY "Assigned accountants can view entities"
ON entities FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM accounting_assignments 
    WHERE accounting_assignments.entity_id = entities.id 
    AND accounting_assignments.accounting_user_id = auth.uid()
  )
);
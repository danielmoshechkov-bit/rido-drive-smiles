-- Usuń zduplikowane polityki SELECT dla entities
DROP POLICY IF EXISTS "Accounting admins can view assigned entities" ON entities;
DROP POLICY IF EXISTS "Accounting users view assigned entities" ON entities;
DROP POLICY IF EXISTS "Admins can view all entities" ON entities;
DROP POLICY IF EXISTS "Admins view all entities" ON entities;
DROP POLICY IF EXISTS "Assigned accountants can view entities" ON entities;
DROP POLICY IF EXISTS "Users can view their own entities" ON entities;
DROP POLICY IF EXISTS "Users view own entities" ON entities;
DROP POLICY IF EXISTS "Users can delete their own entities" ON entities;
DROP POLICY IF EXISTS "Users delete own entities" ON entities;
DROP POLICY IF EXISTS "Users can update their own entities" ON entities;
DROP POLICY IF EXISTS "Users update own entities" ON entities;

-- Utwórz czyste polityki
CREATE POLICY "Users can view own entities" 
ON entities FOR SELECT 
TO authenticated 
USING (owner_user_id = auth.uid());

CREATE POLICY "Admins can view all entities" 
ON entities FOR SELECT 
TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view assigned entities" 
ON entities FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM accounting_assignments 
    WHERE accounting_assignments.entity_id = entities.id 
    AND accounting_assignments.accounting_user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own entities" 
ON entities FOR UPDATE 
TO authenticated 
USING (owner_user_id = auth.uid()) 
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Users can delete own entities" 
ON entities FOR DELETE 
TO authenticated 
USING (owner_user_id = auth.uid());
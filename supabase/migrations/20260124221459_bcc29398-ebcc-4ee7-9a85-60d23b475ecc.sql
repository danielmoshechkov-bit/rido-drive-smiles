-- CRITICAL FIX: Drop all existing policies on entities and recreate cleanly
DROP POLICY IF EXISTS "Authenticated users can insert own entities" ON entities;
DROP POLICY IF EXISTS "Any authenticated user can create entities" ON entities;
DROP POLICY IF EXISTS "Users can select own entities" ON entities;
DROP POLICY IF EXISTS "Users can view own entities" ON entities;
DROP POLICY IF EXISTS "Users can update own entities" ON entities;
DROP POLICY IF EXISTS "Users can delete own entities" ON entities;
DROP POLICY IF EXISTS "Entity owners can manage" ON entities;
DROP POLICY IF EXISTS "Accounting admins can view assigned entities" ON entities;
DROP POLICY IF EXISTS "Admins can manage all entities" ON entities;
DROP POLICY IF EXISTS "Accounting admins can view" ON entities;

-- INSERT: Any authenticated user can create their own entity
-- The owner_user_id MUST match auth.uid() - no NULL allowed
CREATE POLICY "entities_insert_own"
ON entities FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());

-- SELECT: Users can see their own entities OR entities they're assigned to as accountant
CREATE POLICY "entities_select_own_or_assigned"
ON entities FOR SELECT TO authenticated
USING (
  owner_user_id = auth.uid() 
  OR is_accounting_admin_for_entity(id)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- UPDATE: Only owner can update
CREATE POLICY "entities_update_own"
ON entities FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- DELETE: Only owner can delete
CREATE POLICY "entities_delete_own"
ON entities FOR DELETE TO authenticated
USING (owner_user_id = auth.uid());

-- Make sure owner_user_id column does NOT have a default (user must explicitly set it)
ALTER TABLE entities ALTER COLUMN owner_user_id DROP DEFAULT;
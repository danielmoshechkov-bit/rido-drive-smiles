-- Drop ALL existing policies on entities to start clean
DROP POLICY IF EXISTS "entities_insert_for_authenticated" ON entities;
DROP POLICY IF EXISTS "entities_insert_authenticated" ON entities;
DROP POLICY IF EXISTS "entities_insert_own" ON entities;
DROP POLICY IF EXISTS "entities_insert_own_v2" ON entities;
DROP POLICY IF EXISTS "entities_select_own_or_assigned" ON entities;
DROP POLICY IF EXISTS "entities_update_own" ON entities;
DROP POLICY IF EXISTS "entities_delete_own" ON entities;
DROP POLICY IF EXISTS "Any authenticated user can create entities" ON entities;
DROP POLICY IF EXISTS "Users can view their own entities" ON entities;
DROP POLICY IF EXISTS "Users can update their own entities" ON entities;
DROP POLICY IF EXISTS "Users can delete their own entities" ON entities;

-- Create simple, working policies

-- INSERT: Any authenticated user can insert, owner_user_id defaults to auth.uid()
-- The check ensures owner_user_id IS NULL (will get default) OR matches the current user
CREATE POLICY "entities_insert_policy" ON entities
FOR INSERT TO authenticated
WITH CHECK (
  owner_user_id IS NULL OR owner_user_id = auth.uid()
);

-- SELECT: Users can see their own entities, or entities assigned to them, or admin can see all
CREATE POLICY "entities_select_policy" ON entities
FOR SELECT TO authenticated
USING (
  owner_user_id = auth.uid() 
  OR is_accounting_admin_for_entity(id) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- UPDATE: Only owner can update their entities
CREATE POLICY "entities_update_policy" ON entities
FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- DELETE: Only owner can delete their entities
CREATE POLICY "entities_delete_policy" ON entities
FOR DELETE TO authenticated
USING (owner_user_id = auth.uid());
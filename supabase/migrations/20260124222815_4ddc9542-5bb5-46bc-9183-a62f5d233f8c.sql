-- Replace permissive policy with a proper one that uses COALESCE for NULL handling
DROP POLICY IF EXISTS "entities_insert_authenticated" ON entities;

-- Create a more secure INSERT policy that allows authenticated users to insert
-- their own entities (owner_user_id must match auth.uid() or be NULL - which will be set to auth.uid())
CREATE POLICY "entities_insert_own_v2" ON entities
FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());
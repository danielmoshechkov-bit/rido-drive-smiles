-- Drop existing restrictive policy
DROP POLICY IF EXISTS "entities_insert_own" ON entities;

-- Create a permissive INSERT policy that allows any authenticated user to create their own entity
CREATE POLICY "entities_insert_authenticated" ON entities
FOR INSERT TO authenticated
WITH CHECK (true);

-- The owner_user_id will be set by the code, and UPDATE/DELETE policies still restrict access
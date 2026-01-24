-- Drop the potentially conflicting INSERT policy and recreate it
DROP POLICY IF EXISTS "Authenticated users can create own entities" ON entities;

-- Create a simpler, more direct INSERT policy that only checks the owner_user_id
CREATE POLICY "Any authenticated user can create entities"
ON entities
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

-- Also ensure there's no issue with the SELECT policy blocking the insert+select
-- The insert().select() pattern needs both INSERT and SELECT permissions
-- Let's add a policy that allows selecting the row just inserted
DROP POLICY IF EXISTS "Users can view own entities" ON entities;

CREATE POLICY "Users can view own entities"
ON entities
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());
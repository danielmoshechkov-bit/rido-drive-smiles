-- Make owner_user_id NOT NULL with default to auth.uid()
-- First update any NULL values if they exist
UPDATE entities SET owner_user_id = created_at::text::uuid WHERE owner_user_id IS NULL;

-- Set default value for owner_user_id
ALTER TABLE entities ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

-- Drop old restrictive policy and create a simpler one
DROP POLICY IF EXISTS "entities_insert_own_v2" ON entities;

-- Create a policy that allows insert when owner_user_id matches auth.uid() OR is NULL (will use default)
CREATE POLICY "entities_insert_for_authenticated" ON entities
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE(owner_user_id, auth.uid()) = auth.uid()
);
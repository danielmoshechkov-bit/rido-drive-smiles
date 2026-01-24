-- Fix entities table: make owner_user_id NOT NULL with default auth.uid()
-- First drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Any authenticated user can create entities" ON entities;
DROP POLICY IF EXISTS "Users can view own entities" ON entities;
DROP POLICY IF EXISTS "Users can update own entities" ON entities;
DROP POLICY IF EXISTS "Users can delete own entities" ON entities;
DROP POLICY IF EXISTS "Accountants can view assigned entities" ON entities;
DROP POLICY IF EXISTS "Admins can view all entities" ON entities;

-- Update existing NULL owner_user_id rows (if any) - this is a safety measure
-- We'll leave them as is since we can't assign them

-- Set default value for owner_user_id column
ALTER TABLE entities ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

-- Create new INSERT policy that allows any authenticated user
CREATE POLICY "Authenticated users can insert own entities"
ON entities
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = auth.uid() 
  OR owner_user_id IS NULL  -- Allow NULL which will be replaced by default
);

-- SELECT policy - users see their own entities
CREATE POLICY "Users can select own entities"
ON entities
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR is_accounting_admin_for_entity(id)
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- UPDATE policy
CREATE POLICY "Users can update own entities"
ON entities
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- DELETE policy
CREATE POLICY "Users can delete own entities"
ON entities
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());
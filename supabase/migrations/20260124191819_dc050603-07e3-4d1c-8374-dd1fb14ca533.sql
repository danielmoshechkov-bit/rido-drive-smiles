-- Fix RLS policies for entities table
-- Allow any authenticated user to create their own entities

-- Drop potentially conflicting policies
DROP POLICY IF EXISTS "Users can insert their own entities" ON entities;
DROP POLICY IF EXISTS "Anyone can create own entity" ON entities;
DROP POLICY IF EXISTS "Users can create entities" ON entities;

-- Create proper INSERT policy for authenticated users
CREATE POLICY "Authenticated users can create own entities" 
ON entities FOR INSERT 
TO authenticated 
WITH CHECK (owner_user_id = auth.uid());

-- Ensure SELECT policy exists for owners
DROP POLICY IF EXISTS "Users can view their own entities" ON entities;
CREATE POLICY "Users can view their own entities" 
ON entities FOR SELECT 
TO authenticated 
USING (owner_user_id = auth.uid());

-- Ensure UPDATE policy exists for owners
DROP POLICY IF EXISTS "Users can update their own entities" ON entities;
CREATE POLICY "Users can update their own entities" 
ON entities FOR UPDATE 
TO authenticated 
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- Ensure DELETE policy exists for owners
DROP POLICY IF EXISTS "Users can delete their own entities" ON entities;
CREATE POLICY "Users can delete their own entities" 
ON entities FOR DELETE 
TO authenticated 
USING (owner_user_id = auth.uid());

-- Also allow accounting admins to view assigned entities
DROP POLICY IF EXISTS "Accounting admins can view assigned entities" ON entities;
CREATE POLICY "Accounting admins can view assigned entities"
ON entities FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid() 
  OR 
  EXISTS (
    SELECT 1 FROM accounting_assignments 
    WHERE accounting_assignments.entity_id = entities.id 
    AND accounting_assignments.accounting_user_id = auth.uid()
  )
);
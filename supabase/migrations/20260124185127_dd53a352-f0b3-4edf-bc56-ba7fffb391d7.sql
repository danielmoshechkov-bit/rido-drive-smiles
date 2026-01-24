-- Fix infinite recursion in RLS policies

-- Drop the problematic policies
DROP POLICY IF EXISTS "Accounting admins can view assigned entities" ON entities;
DROP POLICY IF EXISTS "Entity owners can manage assignments" ON accounting_assignments;

-- Create a security definer function to check accounting access without RLS recursion
CREATE OR REPLACE FUNCTION public.is_accounting_admin_for_entity(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounting_assignments 
    WHERE entity_id = p_entity_id 
    AND accounting_user_id = auth.uid()
  )
$$;

-- Create a security definer function to check entity ownership without RLS recursion
CREATE OR REPLACE FUNCTION public.is_entity_owner(p_entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM entities 
    WHERE id = p_entity_id 
    AND owner_user_id = auth.uid()
  )
$$;

-- Recreate entity policy for accounting admins using security definer function
CREATE POLICY "Accounting admins can view assigned entities" 
ON entities 
FOR SELECT 
USING (is_accounting_admin_for_entity(id));

-- Recreate accounting_assignments policy using security definer function
CREATE POLICY "Entity owners can manage assignments" 
ON accounting_assignments 
FOR ALL 
USING (is_entity_owner(entity_id));
-- Fix entities INSERT policy to use auth.uid() directly
-- The issue is session mismatch where getUser() returns stale data

-- Drop existing problematic policy
DROP POLICY IF EXISTS entities_insert_policy ON public.entities;

-- Create new policy that doesn't depend on the client sending correct owner_user_id
-- The INSERT will succeed, but we also add a trigger to FORCE correct owner_user_id
CREATE POLICY "Users can insert their own entities"
ON public.entities
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

-- Create a trigger to automatically set owner_user_id on insert
-- This ensures even if client sends wrong ID, it gets overwritten
CREATE OR REPLACE FUNCTION public.set_entity_owner_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.owner_user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger that runs BEFORE INSERT
DROP TRIGGER IF EXISTS trigger_set_entity_owner ON public.entities;
CREATE TRIGGER trigger_set_entity_owner
  BEFORE INSERT ON public.entities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_entity_owner_user_id();
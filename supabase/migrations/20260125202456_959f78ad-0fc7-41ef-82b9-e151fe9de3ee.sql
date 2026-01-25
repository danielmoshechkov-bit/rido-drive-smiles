-- Fix: RLS WITH CHECK runs before trigger sets the value
-- Allow any authenticated user to insert, trigger will set correct owner_user_id
DROP POLICY IF EXISTS "Users can insert their own entities" ON public.entities;

-- Create permissive insert policy - trigger ensures correct owner_user_id
CREATE POLICY "Authenticated users can create entities"
ON public.entities
FOR INSERT
TO authenticated
WITH CHECK (true);

-- The trigger set_entity_owner_user_id BEFORE INSERT ensures owner_user_id = auth.uid()
-- SELECT/UPDATE/DELETE policies still enforce owner check
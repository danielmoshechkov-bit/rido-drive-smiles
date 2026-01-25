-- Drop and recreate UPDATE policy for entities to allow owner and accounting admins
DROP POLICY IF EXISTS "entities_update_policy" ON public.entities;

CREATE POLICY "entities_update_policy" 
ON public.entities 
FOR UPDATE 
TO authenticated
USING (
  owner_user_id = auth.uid() 
  OR is_accounting_admin_for_entity(id) 
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  owner_user_id = auth.uid() 
  OR is_accounting_admin_for_entity(id) 
  OR has_role(auth.uid(), 'admin'::app_role)
);
-- Allow users to insert real_estate_agent role for themselves
CREATE POLICY "Users can insert real_estate_agent role for themselves"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'real_estate_agent'::app_role
);

-- Allow users to insert marketplace_user role for themselves  
CREATE POLICY "Users can insert marketplace_user role for themselves"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'marketplace_user'::app_role
);

-- Fix existing data: add missing real_estate_agent role for warszawa@car4ride.pl
INSERT INTO public.user_roles (user_id, role)
VALUES ('b85d1e29-bc07-4b9b-82ba-857b049785ab', 'real_estate_agent')
ON CONFLICT (user_id, role) DO NOTHING;
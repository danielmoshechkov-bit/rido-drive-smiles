-- Allow admins to view all real estate agents
CREATE POLICY "Admins can view all agents"
ON public.real_estate_agents
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'real_estate_admin')
);

-- Allow admins to update all real estate agents (for verification)
CREATE POLICY "Admins can update all agents"
ON public.real_estate_agents
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'real_estate_admin')
);

-- Allow admins to view all real estate listings
CREATE POLICY "Admins can view all listings"
ON public.real_estate_listings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'real_estate_admin')
);

-- Allow admins to update all real estate listings (for moderation)
CREATE POLICY "Admins can update all listings"
ON public.real_estate_listings
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'real_estate_admin')
);
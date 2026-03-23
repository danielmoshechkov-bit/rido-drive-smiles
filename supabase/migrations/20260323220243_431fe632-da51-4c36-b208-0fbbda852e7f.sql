-- Allow each user to SELECT their own company_settings
CREATE POLICY "Users can view own company_settings"
ON public.company_settings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow each user to INSERT their own company_settings
CREATE POLICY "Users can insert own company_settings"
ON public.company_settings
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow each user to UPDATE their own company_settings
CREATE POLICY "Users can update own company_settings"
ON public.company_settings
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
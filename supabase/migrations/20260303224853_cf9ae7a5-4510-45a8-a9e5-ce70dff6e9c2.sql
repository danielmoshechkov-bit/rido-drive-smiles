-- Allow authenticated users to check if their own email is whitelisted
CREATE POLICY "Users can check own email in whitelist"
ON public.workspace_email_whitelist
FOR SELECT
TO authenticated
USING (LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())));

-- Fix the broken RLS policy that queries auth.users (causes permission denied)
DROP POLICY IF EXISTS "Users can check own email in whitelist" ON public.workspace_email_whitelist;

-- Use auth.jwt() instead which doesn't require table access
CREATE POLICY "Users can check own email in whitelist"
ON public.workspace_email_whitelist
FOR SELECT
TO authenticated
USING (LOWER(email) = LOWER(auth.jwt()->>'email'));

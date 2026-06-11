-- Rollback for migration 20260523_fix_driver_self_access_rls.sql
-- Removes the two SELECT policies and returns RLS to the post-2026-05-07 state.
-- WARNING: re-locks drivers out of their own data — use only if the new policies
-- caused unexpected issues (e.g. unwanted cross-driver visibility, which should
-- not happen since both policies are scoped by auth.uid()).
--
-- This file is NOT tracked in git (see .gitignore: _local-rollbacks/) so it will
-- not be picked up by Lovable Cloud as a migration. Run it manually in the
-- Supabase SQL Editor for project wclrrytmrscqvsyxyvnn if needed.

DROP POLICY IF EXISTS "Users can view their own driver_app_users record"
  ON public.driver_app_users;

DROP POLICY IF EXISTS "Drivers can view their own driver record"
  ON public.drivers;

-- Verification: both policies should be gone (expected: 0 rows)
SELECT polname
FROM pg_policy
WHERE polrelid IN ('public.driver_app_users'::regclass, 'public.drivers'::regclass)
  AND polname IN ('Users can view their own driver_app_users record',
                  'Drivers can view their own driver record');

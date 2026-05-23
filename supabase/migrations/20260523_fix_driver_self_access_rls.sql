-- Restore driver self-access RLS that was unintentionally removed on 2026-05-07.
--
-- Migration 20260507184637 ("Fixed admin data leaks") dropped the permissive
-- USING(true) policy on driver_app_users (replacing it with an admin-only ALL
-- policy) and dropped "Users can select drivers they just created by email"
-- on drivers, without leaving any self-access path for drivers themselves.
-- As a result drivers could no longer read their own driver_app_users link
-- nor their own drivers row, which cascades into every downstream policy
-- that uses `EXISTS (SELECT ... FROM driver_app_users WHERE user_id = auth.uid())`
-- (settlements, fuel, debts, documents, messages, etc.).
--
-- This migration restores the minimum self-SELECT policies needed for a
-- driver to access their own data, while preserving the admin/fleet hardening
-- introduced on 2026-05-07.

-- 1) driver_app_users — driver can read their own link row
DROP POLICY IF EXISTS "Users can view their own driver_app_users record"
  ON public.driver_app_users;

CREATE POLICY "Users can view their own driver_app_users record"
ON public.driver_app_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2) drivers — driver can read their own driver row via the link
DROP POLICY IF EXISTS "Drivers can view their own driver record"
  ON public.drivers;

CREATE POLICY "Drivers can view their own driver record"
ON public.drivers
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT driver_id FROM public.driver_app_users WHERE user_id = auth.uid()
  )
);

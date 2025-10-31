-- Fix missing driver roles issue (with validation)
-- This migration:
-- 1. Adds driver role for existing driver (PIOTR)
-- 2. Backfills driver roles for all existing driver_app_users (only valid auth users)
-- 3. Creates automatic role assignment when driver_app_users entry is created

-- 1. Add driver role for PIOTR (user_id verified)
INSERT INTO public.user_roles (user_id, role)
VALUES ('53506b2e-3406-44fc-81d0-16a38c17f3c9', 'driver')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Backfill driver roles for all existing driver_app_users
-- Only for users that actually exist in auth.users
INSERT INTO public.user_roles (user_id, role)
SELECT dau.user_id, 'driver'::app_role
FROM public.driver_app_users dau
WHERE EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = dau.user_id
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = dau.user_id AND ur.role = 'driver'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Create function to automatically assign driver role
CREATE OR REPLACE FUNCTION public.ensure_driver_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert driver role for the new driver_app_user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 4. Create trigger to call the function after INSERT on driver_app_users
DROP TRIGGER IF EXISTS driver_app_users_assign_role ON public.driver_app_users;
CREATE TRIGGER driver_app_users_assign_role
AFTER INSERT ON public.driver_app_users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_driver_role();
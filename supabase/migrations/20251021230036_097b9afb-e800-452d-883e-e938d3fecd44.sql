-- Fix driver_app_users: Update user_id to point to correct Auth account based on email match
-- Currently user_id = driver_id which is wrong

-- Update user_id to match auth.users.id based on email
UPDATE public.driver_app_users dau
SET user_id = au.id
FROM public.drivers d
JOIN auth.users au ON au.email = d.email
WHERE dau.driver_id = d.id
  AND dau.user_id = d.id  -- Only fix records where user_id incorrectly equals driver_id
  AND au.email IS NOT NULL;
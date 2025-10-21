-- Fix existing drivers: Create driver_app_users entries for all drivers with Auth accounts
-- This allows them to log in and see their settlements

-- Insert missing driver_app_users records
INSERT INTO public.driver_app_users (user_id, driver_id, city_id, phone)
SELECT 
  d.id as user_id,
  d.id as driver_id,
  d.city_id,
  d.phone
FROM public.drivers d
WHERE NOT EXISTS (
  SELECT 1 
  FROM public.driver_app_users dau 
  WHERE dau.driver_id = d.id
)
ON CONFLICT (user_id) DO NOTHING;
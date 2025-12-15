-- Fix get_driver_city_id() to check drivers.city_id first via driver_app_users.driver_id
CREATE OR REPLACE FUNCTION public.get_driver_city_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- First check city_id from drivers table via driver_app_users.driver_id
    (SELECT d.city_id FROM drivers d 
     JOIN driver_app_users dau ON dau.driver_id = d.id 
     WHERE dau.user_id = auth.uid() LIMIT 1),
    -- Fallback: city_id directly from driver_app_users
    (SELECT city_id FROM driver_app_users WHERE user_id = auth.uid() LIMIT 1)
  )
$$;
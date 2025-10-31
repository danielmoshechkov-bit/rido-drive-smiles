-- 1. RLS Policy pozwalająca kierowcom odczytać własny profil
CREATE POLICY "Drivers can view their own profile"
ON public.drivers FOR SELECT
USING (
  id IN (
    SELECT driver_id 
    FROM driver_app_users 
    WHERE user_id = auth.uid()
  )
);

-- 2. Funkcja pomocnicza do łączenia użytkownika auth z kierowcą
CREATE OR REPLACE FUNCTION public.link_auth_user_to_driver(
  p_user_id uuid,
  p_driver_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city_id uuid;
BEGIN
  -- Sprawdź czy driver istnieje i pobierz city_id
  SELECT city_id INTO v_city_id
  FROM drivers
  WHERE id = p_driver_id;
  
  IF v_city_id IS NULL THEN
    RAISE EXCEPTION 'Driver with id % not found', p_driver_id;
  END IF;
  
  -- Utwórz lub zaktualizuj rekord w driver_app_users
  INSERT INTO driver_app_users (user_id, driver_id, city_id)
  VALUES (p_user_id, p_driver_id, v_city_id)
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    driver_id = p_driver_id,
    city_id = v_city_id;
  
  -- Zapewnij rolę driver w user_roles
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'driver')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
-- Funkcja SECURITY DEFINER sprawdzająca czy użytkownik jest kierowcą
CREATE OR REPLACE FUNCTION public.is_driver_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM driver_app_users WHERE user_id = auth.uid()
  )
$$;

-- Uproszczona polityka INSERT dla pojazdów - używa funkcji SECURITY DEFINER
DROP POLICY IF EXISTS "Drivers can insert own vehicles" ON public.vehicles;

CREATE POLICY "Drivers can insert own vehicles" ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  (fleet_id IS NOT NULL AND fleet_id = get_user_fleet_id(auth.uid())) OR
  (fleet_id IS NULL AND is_driver_user())
);
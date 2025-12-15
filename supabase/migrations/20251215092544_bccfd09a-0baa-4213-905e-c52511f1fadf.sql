-- Uproszczona polityka INSERT dla kierowców - pozwala dodawać auta bez restrykcji city_id
DROP POLICY IF EXISTS "Drivers can insert own vehicles" ON public.vehicles;

CREATE POLICY "Drivers can insert own vehicles" ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  -- Admin może wszystko
  has_role(auth.uid(), 'admin') OR
  -- Fleet może dodawać do swojej floty
  (fleet_id IS NOT NULL AND fleet_id = get_user_fleet_id(auth.uid())) OR
  -- Kierowca może dodać auto BEZ floty (fleet_id IS NULL) - wystarczy że jest zarejestrowany jako driver
  (fleet_id IS NULL AND EXISTS (
    SELECT 1 FROM driver_app_users WHERE user_id = auth.uid()
  ))
);
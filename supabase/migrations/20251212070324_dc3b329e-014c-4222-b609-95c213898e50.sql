-- Pozwól uwierzytelnionym użytkownikom tworzyć rekordy kierowców przy rejestracji
CREATE POLICY "Authenticated users can create driver records during registration"
ON public.drivers
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Pozwól uwierzytelnionym użytkownikom tworzyć powiązanie driver_app_users dla siebie
CREATE POLICY "Authenticated users can insert their driver_app_users record"
ON public.driver_app_users
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Pozwól nowym użytkownikom przypisywać sobie rolę driver
CREATE POLICY "Users can insert driver role for themselves"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND role = 'driver'
);
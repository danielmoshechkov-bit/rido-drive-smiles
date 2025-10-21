-- Utwórz użytkownika admin daniel.moshechkov@gmail.com
-- To musi być zrobione przez Auth API, więc stwórzmy zapasowego admina w tabeli drivers

-- Najpierw sprawdź czy istnieje użytkownik w Auth z tym emailem
-- Jeśli nie, musimy go stworzyć przez Supabase Dashboard > Authentication > Users > Create User

-- Na razie dodajmy zapasowy rekord w drivers dla tego emaila
-- (UUID musi być zgodny z Auth user ID)

-- INFO: Użytkownik daniel.moshechkov@gmail.com musi być utworzony ręcznie przez Dashboard:
-- 1. Otwórz Supabase Dashboard > Authentication > Users
-- 2. Kliknij "Add User" (lub "Create User")
-- 3. Email: daniel.moshechkov@gmail.com
-- 4. Password: danmos050389
-- 5. Auto Confirm User: YES (zaznacz to!)
-- 6. Skopiuj wygenerowany UUID użytkownika

-- Potem uruchom poniższe SQL z tym UUID:

-- Przykład (ZMIEŃ uuid-z-auth na faktyczny UUID z Auth):
-- INSERT INTO public.drivers (
--   id,
--   city_id,
--   first_name,
--   last_name,
--   email,
--   phone,
--   user_role
-- ) VALUES (
--   'uuid-z-auth-dashboard',  -- UUID z Auth Dashboard
--   'f6ecca60-ca80-4227-8409-8a44f5d342fd',  -- Warszawa
--   'Daniel',
--   'Moshechkov',
--   'daniel.moshechkov@gmail.com',
--   '+48000000000',
--   'admin'
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   user_role = 'admin',
--   email = 'daniel.moshechkov@gmail.com';

-- Informacja dla użytkownika:
SELECT 'UWAGA: Musisz ręcznie utworzyć użytkownika daniel.moshechkov@gmail.com w Supabase Dashboard > Authentication > Users!' as message;
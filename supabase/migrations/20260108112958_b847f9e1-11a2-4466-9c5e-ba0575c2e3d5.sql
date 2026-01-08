-- 1. Przypisz rolę 'driver' tylko dla użytkowników którzy ISTNIEJĄ w auth.users
INSERT INTO user_roles (user_id, role)
SELECT dau.user_id, 'driver'::app_role
FROM driver_app_users dau
INNER JOIN auth.users au ON dau.user_id = au.id
LEFT JOIN user_roles ur ON dau.user_id = ur.user_id AND ur.role = 'driver'
WHERE ur.role IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Dodaj kolumnę registration_code do fleets dla indywidualnych linków rejestracyjnych
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS registration_code TEXT UNIQUE;

-- 3. Dodaj kolumnę registered_via_code do drivers żeby wiedzieć skąd przyszedł kierowca
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS registered_via_code TEXT;

-- 4. Wygeneruj unikalne kody dla istniejących flot
UPDATE fleets 
SET registration_code = UPPER(SUBSTRING(MD5(id::text || now()::text) FROM 1 FOR 8))
WHERE registration_code IS NULL;
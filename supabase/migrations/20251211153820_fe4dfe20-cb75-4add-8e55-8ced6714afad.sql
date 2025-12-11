-- Napraw driver_app_users dla Patryka - zmień user_id na prawidłowy auth_id
UPDATE driver_app_users 
SET user_id = '749d4366-e15d-45b4-8fdc-9f3273c83166'
WHERE driver_id = 'ae0eb3fa-64e3-4e25-8dde-ea9ccfa7ab3d';

-- Dodaj rolę kierowcy dla Patryka
INSERT INTO user_roles (user_id, role)
VALUES ('749d4366-e15d-45b4-8fdc-9f3273c83166', 'driver')
ON CONFLICT (user_id, role) DO NOTHING;
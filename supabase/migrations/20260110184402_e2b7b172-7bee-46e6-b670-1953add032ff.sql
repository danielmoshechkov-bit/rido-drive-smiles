-- 1. Dodać rolę real_estate_agent do user_roles
INSERT INTO user_roles (user_id, role)
VALUES ('21ba094d-b587-4030-9fe0-743c2b661ba9', 'real_estate_agent')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Usunąć błędny wpis z tabeli drivers
DELETE FROM drivers 
WHERE id = '21ba094d-b587-4030-9fe0-743c2b661ba9';
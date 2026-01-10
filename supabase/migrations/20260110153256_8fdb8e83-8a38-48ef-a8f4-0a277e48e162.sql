-- Assign real_estate_admin role to main admin (daniel.moshechkov@gmail.com)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'real_estate_admin'::app_role
FROM auth.users 
WHERE email = 'daniel.moshechkov@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
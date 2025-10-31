-- Add admin role for daniel.moshechkov@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('cac64003-b89c-4a73-a2d6-c15155ce1f08', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
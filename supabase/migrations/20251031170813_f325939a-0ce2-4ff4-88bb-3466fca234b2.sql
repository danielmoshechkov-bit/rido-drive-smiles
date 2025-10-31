-- Fix: Add admin role and unique constraint for user_roles

-- Add unique constraint
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Add admin role for the main user (robertrembkowski@gmail.com)
INSERT INTO public.user_roles (user_id, role)
VALUES ('7ba4e07b-dacd-47fe-b94b-eacbcd16f71d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
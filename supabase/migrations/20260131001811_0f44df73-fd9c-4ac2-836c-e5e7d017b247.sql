-- Add sales_admin role to Daniel (main admin)
INSERT INTO public.user_roles (user_id, role)
VALUES ('cac64003-b89c-4a73-a2d6-c15155ce1f08', 'sales_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Add sales_rep role to Anastasiia (sales representative)
INSERT INTO public.user_roles (user_id, role)
VALUES ('44baae8f-2fe8-42c3-88f2-814c43a8d076', 'sales_rep')
ON CONFLICT (user_id, role) DO NOTHING;
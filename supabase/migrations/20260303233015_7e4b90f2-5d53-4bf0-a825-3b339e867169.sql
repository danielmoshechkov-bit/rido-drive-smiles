-- Add service_provider role to anastasiia
INSERT INTO user_roles (user_id, role)
SELECT id, 'service_provider'::app_role FROM auth.users WHERE email = 'anastasiia.shapovalova1991@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
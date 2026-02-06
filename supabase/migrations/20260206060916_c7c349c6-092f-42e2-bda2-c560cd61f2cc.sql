-- Assign service_provider role to test accounts
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('fcba3af4-d18d-44ff-b2c8-5b528d9fa614', 'service_provider'),
  ('f058388d-bb0e-4a8d-9124-347c82eba9b3', 'service_provider')
ON CONFLICT (user_id, role) DO NOTHING;
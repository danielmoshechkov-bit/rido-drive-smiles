-- Insert test driver data for testing purposes
INSERT INTO public.drivers (
  first_name, 
  last_name, 
  email, 
  phone, 
  city_id, 
  user_role,
  billing_method,
  registration_date
) 
SELECT 
  'Test',
  'Kierowca',
  'test@test.pl',
  '+48123456789',
  c.id,
  'kierowca',
  '39+8%',
  now()
FROM public.cities c 
WHERE c.name = 'Warszawa'
LIMIT 1
ON CONFLICT (email) DO NOTHING;
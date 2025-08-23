-- Insert test driver data for testing purposes (without ON CONFLICT)
DO $$
DECLARE
  city_uuid uuid;
BEGIN
  -- Get a city ID (preferably Warszawa or first available)
  SELECT id INTO city_uuid FROM public.cities WHERE name = 'Warszawa' LIMIT 1;
  
  -- If Warszawa doesn't exist, get any city
  IF city_uuid IS NULL THEN
    SELECT id INTO city_uuid FROM public.cities LIMIT 1;
  END IF;
  
  -- Only insert if test driver doesn't exist and we have a city
  IF city_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE email = 'test@test.pl') THEN
    INSERT INTO public.drivers (
      first_name, 
      last_name, 
      email, 
      phone, 
      city_id, 
      user_role,
      billing_method,
      registration_date
    ) VALUES (
      'Test',
      'Kierowca',
      'test@test.pl',
      '+48123456789',
      city_uuid,
      'kierowca',
      '39+8%',
      now()
    );
  END IF;
END $$;
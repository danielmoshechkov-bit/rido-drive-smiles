-- Add test platform IDs for the test driver
DO $$
DECLARE
  test_driver_id uuid;
BEGIN
  -- Get the test driver ID
  SELECT id INTO test_driver_id FROM public.drivers WHERE email = 'test@test.pl' LIMIT 1;
  
  -- Add platform IDs if driver exists and platform IDs don't exist
  IF test_driver_id IS NOT NULL THEN
    -- Add Uber ID if doesn't exist
    IF NOT EXISTS (SELECT 1 FROM public.driver_platform_ids WHERE driver_id = test_driver_id AND platform = 'uber') THEN
      INSERT INTO public.driver_platform_ids (driver_id, platform, platform_id) 
      VALUES (test_driver_id, 'uber', 'UBER123456789');
    END IF;
    
    -- Add Bolt ID if doesn't exist
    IF NOT EXISTS (SELECT 1 FROM public.driver_platform_ids WHERE driver_id = test_driver_id AND platform = 'bolt') THEN
      INSERT INTO public.driver_platform_ids (driver_id, platform, platform_id) 
      VALUES (test_driver_id, 'bolt', 'BOLT987654321');
    END IF;
    
    -- Add FreeNow ID if doesn't exist
    IF NOT EXISTS (SELECT 1 FROM public.driver_platform_ids WHERE driver_id = test_driver_id AND platform = 'freenow') THEN
      INSERT INTO public.driver_platform_ids (driver_id, platform, platform_id) 
      VALUES (test_driver_id, 'freenow', 'FN555666777');
    END IF;
  END IF;
END $$;
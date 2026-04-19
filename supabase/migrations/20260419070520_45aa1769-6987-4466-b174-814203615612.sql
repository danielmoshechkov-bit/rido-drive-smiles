UPDATE public.service_providers
SET category_id = '290bfdce-dac0-48d4-a950-1998e43fea5b' -- Warsztaty samochodowe
WHERE id = '664ed87b-a20f-457b-a9fa-97ca13dcae7c'
  AND category_id IS NULL;
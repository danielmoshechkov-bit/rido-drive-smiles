-- First, alter the service_reviews table to make customer_user_id nullable
ALTER TABLE service_reviews 
ALTER COLUMN customer_user_id DROP NOT NULL;

-- Now insert sample reviews without customer_user_id
INSERT INTO service_reviews (provider_id, customer_user_id, booking_id, rating, comment, is_visible, created_at)
SELECT 
  sp.id,
  NULL,
  NULL,
  (4 + floor(random() * 2))::int,
  CASE floor(random() * 10)
    WHEN 0 THEN 'Świetna obsługa, polecam!'
    WHEN 1 THEN 'Profesjonalna firma, wszystko na czas.'
    WHEN 2 THEN 'Bardzo dobra jakość usług.'
    WHEN 3 THEN 'Szybko i solidnie, polecam każdemu.'
    WHEN 4 THEN 'Fachowa obsługa, konkurencyjne ceny.'
    WHEN 5 THEN 'Rewelacyjna jakość, wrócę na pewno!'
    WHEN 6 THEN 'Profesjonalizm na wysokim poziomie.'
    WHEN 7 THEN 'Bardzo miła obsługa i szybka realizacja.'
    WHEN 8 THEN 'Polecam! Wszystko zgodnie z umową.'
    ELSE 'Dobry kontakt i terminowa realizacja.'
  END,
  true,
  NOW() - (floor(random() * 60) || ' days')::interval
FROM service_providers sp
WHERE sp.status = 'active';

-- Insert second batch of reviews
INSERT INTO service_reviews (provider_id, customer_user_id, booking_id, rating, comment, is_visible, created_at)
SELECT 
  sp.id,
  NULL,
  NULL,
  (3 + floor(random() * 3))::int,
  CASE floor(random() * 8)
    WHEN 0 THEN 'Bardzo zadowolony z usługi.'
    WHEN 1 THEN 'Solidna firma, godna polecenia.'
    WHEN 2 THEN 'Cena adekwatna do jakości.'
    WHEN 3 THEN 'Szybka reakcja na zgłoszenie.'
    WHEN 4 THEN 'Fachowcy znający się na rzeczy.'
    WHEN 5 THEN 'Pełen profesjonalizm!'
    WHEN 6 THEN 'Wszystko super, dziękuję!'
    ELSE 'Polecam, bardzo dobra firma.'
  END,
  true,
  NOW() - (floor(random() * 90) || ' days')::interval
FROM service_providers sp
WHERE sp.status = 'active';

-- Update rating_avg and rating_count for all providers
UPDATE service_providers sp
SET 
  rating_avg = (SELECT AVG(rating) FROM service_reviews sr WHERE sr.provider_id = sp.id AND sr.is_visible = true),
  rating_count = (SELECT COUNT(*) FROM service_reviews sr WHERE sr.provider_id = sp.id AND sr.is_visible = true);
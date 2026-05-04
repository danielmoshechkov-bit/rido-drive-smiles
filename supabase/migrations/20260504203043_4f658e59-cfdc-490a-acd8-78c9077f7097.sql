
-- 1) Rola usługodawcy
INSERT INTO public.user_roles (user_id, role)
VALUES ('bf7c8a4b-f713-4e32-932d-74dfe0616812', 'service_provider')
ON CONFLICT DO NOTHING;

-- 2) Whitelist workspace
INSERT INTO public.workspace_email_whitelist (email)
VALUES ('serwishawryluk@gmail.com')
ON CONFLICT DO NOTHING;

-- 3) Karta usługodawcy (kategoria warsztaty samochodowe – ta sama co Cart78Garage)
INSERT INTO public.service_providers (
  user_id, category_id, company_name, owner_email, company_email, status, sms_balance
) VALUES (
  'bf7c8a4b-f713-4e32-932d-74dfe0616812',
  '290bfdce-dac0-48d4-a950-1998e43fea5b',
  'Serwis Hawryluk',
  'serwishawryluk@gmail.com',
  'serwishawryluk@gmail.com',
  'active',
  100
)
ON CONFLICT DO NOTHING;

-- W razie gdyby rekord już istniał: ustaw 100 SMS i status active
UPDATE public.service_providers
SET sms_balance = GREATEST(COALESCE(sms_balance,0), 100),
    status = 'active'
WHERE user_id = 'bf7c8a4b-f713-4e32-932d-74dfe0616812';

-- 4) company_settings shell
INSERT INTO public.company_settings (user_id, company_name, email, country, currency, default_vat, invoice_prefix)
VALUES ('bf7c8a4b-f713-4e32-932d-74dfe0616812', 'Serwis Hawryluk', 'serwishawryluk@gmail.com', 'Polska', 'PLN', 23, 'FV')
ON CONFLICT DO NOTHING;

-- 5) 10 sprawdzeń pojazdu
INSERT INTO public.vehicle_lookup_credits (user_id, total_credits_purchased, remaining_credits)
VALUES ('bf7c8a4b-f713-4e32-932d-74dfe0616812', 10, 10)
ON CONFLICT (user_id) DO UPDATE SET
  remaining_credits = public.vehicle_lookup_credits.remaining_credits + 10,
  total_credits_purchased = public.vehicle_lookup_credits.total_credits_purchased + 10,
  updated_at = now();

-- 6) Bezterminowy darmowy dostęp do portalu (subskrypcja partnerska)
INSERT INTO public.paid_service_subscriptions (user_id, service_id, status, started_at, expires_at, amount_paid, metadata)
SELECT 'bf7c8a4b-f713-4e32-932d-74dfe0616812', id, 'active', now(), NULL, 0,
       jsonb_build_object('plan','partner_free','granted_by','admin','note','Darmowy bezterminowy dostęp – partner')
FROM public.paid_services
WHERE name ILIKE '%warsz%' OR name ILIKE '%usług%' OR name ILIKE '%portal%'
LIMIT 1;

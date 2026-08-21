-- Odwzorowanie realnego rozkładu kont przed wariantem A.
SET client_min_messages = warning;

INSERT INTO public.billing_features (key, name) VALUES
  ('workshop_core','Rdzen'), ('workshop_invoices','Faktury'), ('ksef','KSeF'),
  ('vehicle_lookup','Sprawdzenia VIN'), ('ai_repair_help','Pomoc AI');

INSERT INTO public.billing_plans (code, name, product_line, price_net, vat_rate, trial_days, is_active, sort_order)
VALUES ('warsztat_pro','Pro','warsztat',169,23,14,true,30),
       ('warsztat_free','Darmowy','warsztat',0,23,0,true,10);

INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT p.id, f.id, true, CASE f.key WHEN 'vehicle_lookup' THEN 0 WHEN 'ai_repair_help' THEN 300 ELSE NULL END
FROM public.billing_plans p CROSS JOIN public.billing_features f WHERE p.code = 'warsztat_pro';

-- Właściciele
INSERT INTO auth.users (id, email)
SELECT ('aaaa0000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid, 'u'||i||'@t.pl'
FROM generate_series(1,6) i;

-- Warsztaty z właścicielem, każdy w innym stanie okresu próbnego
INSERT INTO public.service_providers (id, user_id, company_name) VALUES
 ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001','trial trwa'),
 ('bbbb0000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-000000000002','trial minal'),
 ('bbbb0000-0000-0000-0000-000000000003','aaaa0000-0000-0000-0000-000000000003','trial bez daty'),
 ('bbbb0000-0000-0000-0000-000000000004','aaaa0000-0000-0000-0000-000000000004','bez trialu'),
 ('bbbb0000-0000-0000-0000-000000000005','aaaa0000-0000-0000-0000-000000000005','ma juz subskrypcje'),
 ('bbbb0000-0000-0000-0000-000000000006','aaaa0000-0000-0000-0000-000000000006','drugi warsztat tego samego usera');

INSERT INTO public.paid_service_subscriptions (user_id, status, expires_at) VALUES
 ('aaaa0000-0000-0000-0000-000000000001','trial', now() + interval '9 days'),
 ('aaaa0000-0000-0000-0000-000000000002','trial', now() - interval '40 days'),
 ('aaaa0000-0000-0000-0000-000000000003','trial', NULL),
 ('aaaa0000-0000-0000-0000-000000000005','trial', now() + interval '3 days'),
 ('aaaa0000-0000-0000-0000-000000000006','trial', now() + interval '2 days');

-- Ten JUŻ ma wiersz — migracja nie ma prawa go dotknąć.
INSERT INTO public.billing_subscriptions (subscriber_type, subscriber_id, plan_id, status, current_period_end)
SELECT 'service_provider','bbbb0000-0000-0000-0000-000000000005', id, 'active', now() + interval '20 days'
FROM public.billing_plans WHERE code = 'warsztat_pro';

-- Wydmuszki bez właściciela — nie mają być ruszone.
INSERT INTO public.service_providers (id, user_id, company_name, created_at)
SELECT ('cccc0000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid, NULL, 'wydmuszka '||i, '2026-01-24'
FROM generate_series(1,9) i;

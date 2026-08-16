\set ON_ERROR_STOP on
-- auth.uid() czyta ustawienie sesji, tak jak w Supabase
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, anon;

-- dane
INSERT INTO auth.users (id, email) VALUES
 ('11111111-1111-1111-1111-111111111111','aktywny@x.pl'),
 ('22222222-2222-2222-2222-222222222222','zablokowany@x.pl'),
 ('33333333-3333-3333-3333-333333333333','trial@x.pl'),
 ('44444444-4444-4444-4444-444444444444','trialpo@x.pl'),
 ('55555555-5555-5555-5555-555555555555','fryzjer@x.pl');

INSERT INTO public.billing_plans (id, code, name, price_net, product_line) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','warsztat_pro','Pro',169,'warsztat');

INSERT INTO public.service_providers (id, user_id, status, company_name) VALUES
 ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','active','Aktywny'),
 ('a0000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','active','Zablokowany'),
 ('a0000000-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','active','Trial trwa'),
 ('a0000000-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','active','Trial wygasl'),
 ('a0000000-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','active','Fryzjer');

INSERT INTO public.billing_subscriptions (subscriber_type, subscriber_id, plan_id, status, product_line) VALUES
 ('service_provider','a0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','active','warsztat'),
 ('service_provider','a0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','read_only','warsztat');

INSERT INTO public.paid_service_subscriptions (user_id, status, expires_at, metadata) VALUES
 ('33333333-3333-3333-3333-333333333333','trial', now() + interval '10 days', '{"module":"warsztat"}'),
 ('44444444-4444-4444-4444-444444444444','trial', now() - interval '1 day',  '{"module":"warsztat"}');

\echo '--- moze_pracowac (oczekiwane: t f t f f) ---'
SELECT sp.company_name, public.moze_pracowac(sp.id,'warsztat') AS moze
FROM public.service_providers sp ORDER BY sp.company_name;

\echo '--- jest_klientem_linii (fryzjer musi byc f) ---'
SELECT sp.company_name, public.jest_klientem_linii(sp.id,'warsztat') AS klient
FROM public.service_providers sp ORDER BY sp.company_name;

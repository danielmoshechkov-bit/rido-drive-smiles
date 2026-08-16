-- plan z limitem 100 SMS/mc dla warsztatu bb...bb
INSERT INTO public.billing_subscriptions (id, subscriber_type, subscriber_id, plan_id, status, product_line)
VALUES ('11110000-0000-0000-0000-000000000001','service_provider','bb000000-0000-0000-0000-0000000000bb',
        'aaaaaaaa-0000-0000-0000-000000000001','active','warsztat') ON CONFLICT DO NOTHING;
INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', id, true, 100 FROM public.billing_features WHERE key='sms'
ON CONFLICT DO NOTHING;
DELETE FROM public.billing_usage; DELETE FROM public.billing_overage;
UPDATE public.billing_addon_packs SET amount_remaining = 0;
-- jedna paczka 50 wygasa wczesniej, druga 200 bezterminowa
INSERT INTO public.billing_addon_packs (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining, expires_at, source)
SELECT 'service_provider','bb000000-0000-0000-0000-0000000000bb', id, 50, 50, now()+interval '5 days','purchase' FROM public.billing_features WHERE key='sms';
INSERT INTO public.billing_addon_packs (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining, expires_at, source)
SELECT 'service_provider','bb000000-0000-0000-0000-0000000000bb', id, 200, 200, NULL,'purchase' FROM public.billing_features WHERE key='sms';

\echo '=== 60 sztuk: wszystko z puli planu (limit 100) ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',60);

\echo '=== 60 kolejnych: 40 z puli, 20 z paczki wygasajacej NAJWCZESNIEJ ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',60);
SELECT amount_total, amount_remaining, expires_at IS NULL AS bezterminowa
FROM public.billing_addon_packs WHERE subscriber_id='bb000000-0000-0000-0000-0000000000bb' AND amount_total IN (50,200) ORDER BY amount_total;

\echo '=== 100 sztuk: 30 z paczki krotszej, 70 z bezterminowej ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',100);
SELECT amount_total, amount_remaining FROM public.billing_addon_packs
WHERE subscriber_id='bb000000-0000-0000-0000-0000000000bb' AND amount_total IN (50,200) ORDER BY amount_total;

\echo '=== zuzycie liczy WSZYSTKO (60+60+100 = 220) ==='
SELECT used FROM public.billing_usage WHERE subscriber_id='bb000000-0000-0000-0000-0000000000bb';

\echo '=== 200 sztuk: 130 z paczki, 70 nadwyzki po 0,20 = 14,00 zl ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',200);
SELECT units, amount_net FROM public.billing_overage WHERE subscriber_id='bb000000-0000-0000-0000-0000000000bb';

\echo '=== SUFIT: 200 zl/mc. 1000 sztuk = 200 zl, razem ponad sufit -> ODMOWA ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',1000);
SELECT units, amount_net FROM public.billing_overage WHERE subscriber_id='bb000000-0000-0000-0000-0000000000bb';

\echo '=== bez zgody na nadwyzke: odmowa zamiast doliczenia ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',10,false);

\echo '=== funkcja spoza planu ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','tecrmi',1);
\echo '=== nieznana funkcja i zerowa liczba ==='
SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','nie_ma_takiej',1);
SELECT public.probuj('zero jednostek', $$SELECT public.billing_consume('service_provider','bb000000-0000-0000-0000-0000000000bb','sms',0)$$);

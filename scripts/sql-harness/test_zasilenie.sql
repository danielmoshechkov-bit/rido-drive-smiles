-- czysty warsztat z saldem 0
INSERT INTO auth.users (id, email) VALUES ('aa000000-0000-0000-0000-0000000000aa','kup@x.pl') ON CONFLICT DO NOTHING;
INSERT INTO public.service_providers (id, user_id, status, company_name, sms_balance)
VALUES ('bb000000-0000-0000-0000-0000000000bb','aa000000-0000-0000-0000-0000000000aa','active','Kupujacy',0)
ON CONFLICT (id) DO UPDATE SET sms_balance = 0;
DELETE FROM public.sms_credit_ledger WHERE provider_id='bb000000-0000-0000-0000-0000000000bb';

\echo '=== przed zakupem: saldo 0 ==='
SELECT sms_balance FROM public.service_providers WHERE id='bb000000-0000-0000-0000-0000000000bb';

-- zamowienie na 500 SMS
INSERT INTO public.billing_orders (id, subscriber_type, subscriber_id, user_id, product_id, units, amount_gross, status, provider_order_id)
SELECT 'cc000000-0000-0000-0000-0000000000cc','service_provider','bb000000-0000-0000-0000-0000000000bb',
       'aa000000-0000-0000-0000-0000000000aa', id, 500, 123.00, 'oplacone','PAYU-500'
FROM public.billing_addon_products WHERE code='sms';

\echo '=== wydanie paczki ==='
SELECT public.billing_wydaj_paczke('cc000000-0000-0000-0000-0000000000cc') IS NOT NULL AS wydano;

\echo '=== saldo widoczne dla klienta MUSI byc 500 ==='
SELECT sms_balance FROM public.service_providers WHERE id='bb000000-0000-0000-0000-0000000000bb';

\echo '=== ksiega SMS ma wpis zakupu ==='
SELECT delta, powod, opis FROM public.sms_credit_ledger
 WHERE provider_id='bb000000-0000-0000-0000-0000000000bb' ORDER BY created_at;

\echo '=== paczka oznaczona jako policzona w starym saldzie ==='
SELECT amount_total, amount_remaining, odzwierciedlone_at IS NOT NULL AS policzona
FROM public.billing_addon_packs WHERE order_id='cc000000-0000-0000-0000-0000000000cc';

\echo '=== ksiega zgodna z saldem (roznica 0) ==='
SELECT saldo, suma_ksiegi, roznica FROM public.sms_saldo_kontrola
 WHERE provider_id='bb000000-0000-0000-0000-0000000000bb';

\echo '=== POWTORNE powiadomienie: bez podwojnego zasilenia ==='
SELECT public.billing_wydaj_paczke('cc000000-0000-0000-0000-0000000000cc');
SELECT public.billing_wydaj_paczke('cc000000-0000-0000-0000-0000000000cc');
SELECT sms_balance AS saldo_po_trzech_powiadomieniach FROM public.service_providers
 WHERE id='bb000000-0000-0000-0000-0000000000bb';
SELECT count(*) AS paczek FROM public.billing_addon_packs WHERE order_id='cc000000-0000-0000-0000-0000000000cc';

\echo '=== VIN: 20 sprawdzen ==='
INSERT INTO public.billing_orders (id, subscriber_type, subscriber_id, user_id, product_id, units, amount_gross, status, provider_order_id)
SELECT 'dd000000-0000-0000-0000-0000000000dd','service_provider','bb000000-0000-0000-0000-0000000000bb',
       'aa000000-0000-0000-0000-0000000000aa', id, 20, 41.82, 'oplacone','PAYU-VIN'
FROM public.billing_addon_products WHERE code='vehicle_lookup';
SELECT public.billing_wydaj_paczke('dd000000-0000-0000-0000-0000000000dd') IS NOT NULL AS wydano_vin;
SELECT remaining_credits FROM public.vehicle_lookup_credits WHERE user_id='aa000000-0000-0000-0000-0000000000aa';
SELECT type, credits, source FROM public.vehicle_lookup_credit_transactions
 WHERE user_id='aa000000-0000-0000-0000-0000000000aa' ORDER BY created_at DESC LIMIT 1;

\echo '=== swieze zamowienie NIE jest porzucane ==='
INSERT INTO public.billing_orders (id, subscriber_type, subscriber_id, product_id, units, amount_gross, status, created_at)
SELECT 'ee000000-0000-0000-0000-0000000000ee','service_provider','bb000000-0000-0000-0000-0000000000bb', id, 100, 24.60, 'oczekuje', now()
FROM public.billing_addon_products WHERE code='sms';
SELECT public.billing_wygas_porzucone(6) AS oznaczono_swieze;

\echo '=== stare zamowienie JEST porzucane ==='
UPDATE public.billing_orders SET created_at = now() - interval '8 hours'
 WHERE id='ee000000-0000-0000-0000-0000000000ee';
SELECT public.billing_wygas_porzucone(6) AS oznaczono_stare;
SELECT status FROM public.billing_orders WHERE id='ee000000-0000-0000-0000-0000000000ee';

\echo '=== zamowienie z WYDANYM pakietem nigdy nie jest ruszane ==='
UPDATE public.billing_orders SET created_at = now() - interval '30 days'
 WHERE id='cc000000-0000-0000-0000-0000000000cc';
SELECT public.billing_wygas_porzucone(6) AS oznaczono_wydane;
SELECT status, wydane_at IS NOT NULL AS ma_pakiet FROM public.billing_orders
 WHERE id='cc000000-0000-0000-0000-0000000000cc';

\echo '=== spoznione COMPLETED nadal wydaje pakiet ==='
UPDATE public.billing_orders SET status='oplacone' WHERE id='ee000000-0000-0000-0000-0000000000ee';
SELECT public.billing_wydaj_paczke('ee000000-0000-0000-0000-0000000000ee') IS NOT NULL AS wydano_mimo_porzucenia;
SELECT sms_balance FROM public.service_providers WHERE id='bb000000-0000-0000-0000-0000000000bb';

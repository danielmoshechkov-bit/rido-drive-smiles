
INSERT INTO public.paid_services (name, description, category, price_pln, pricing_type, is_active)
VALUES ('Portal Warsztatowy - Partner', 'Pełny dostęp do portalu warsztatowego dla partnerów (darmowo, bezterminowo)', 'workshop', 0, 'monthly', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.paid_service_subscriptions (user_id, service_id, status, started_at, expires_at, amount_paid, metadata)
SELECT 'bf7c8a4b-f713-4e32-932d-74dfe0616812', id, 'active', now(), NULL, 0,
       jsonb_build_object('plan','partner_free','granted_by','admin','note','Darmowy bezterminowy dostęp – partner')
FROM public.paid_services
WHERE name = 'Portal Warsztatowy - Partner'
LIMIT 1;

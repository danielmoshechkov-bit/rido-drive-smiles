-- Test zachowania 4.12 — na danych, nie na pustej bazie.
--
-- Odtwarza przypadek z produkcji (CART78GARAGE: saldo 48, paczki
-- odzwierciedlone 30) plus pracownika z własnymi kredytami.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Dane
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'wlasciciel@test.pl'),
  ('22222222-2222-2222-2222-222222222222', 'mechanik@test.pl'),
  ('33333333-3333-3333-3333-333333333333', 'klient@test.pl')
ON CONFLICT DO NOTHING;

INSERT INTO service_providers (id, user_id, company_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'TEST GARAGE')
ON CONFLICT DO NOTHING;

INSERT INTO workshop_employees (provider_id, user_id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Mechanik')
ON CONFLICT DO NOTHING;

-- Właściciel: 48 na saldzie osobistym
INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
VALUES ('11111111-1111-1111-1111-111111111111', 48, 78) ON CONFLICT (user_id) DO UPDATE
  SET remaining_credits = 48, total_credits_purchased = 78;
-- Pracownik: 7 własnych, kupionych prywatnie
INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
VALUES ('22222222-2222-2222-2222-222222222222', 7, 7) ON CONFLICT (user_id) DO UPDATE
  SET remaining_credits = 7;
-- Klient bez warsztatu: 5
INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
VALUES ('33333333-3333-3333-3333-333333333333', 5, 5) ON CONFLICT (user_id) DO UPDATE
  SET remaining_credits = 5;

-- Paczka-duplikat: 30 jednostek, które JUŻ są w saldzie właściciela
INSERT INTO billing_addon_packs
  (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
   source, odzwierciedlone_at)
SELECT 'service_provider', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 30, 30, 'purchase', now()
FROM billing_features WHERE key = 'vehicle_lookup';

\echo '=== PRZED ==='
SELECT
  (SELECT remaining_credits FROM vehicle_lookup_credits WHERE user_id='11111111-1111-1111-1111-111111111111') AS wlasciciel,
  (SELECT remaining_credits FROM vehicle_lookup_credits WHERE user_id='22222222-2222-2222-2222-222222222222') AS pracownik,
  (SELECT remaining_credits FROM vehicle_lookup_credits WHERE user_id='33333333-3333-3333-3333-333333333333') AS klient,
  (SELECT COALESCE(sum(amount_remaining),0) FROM billing_addon_packs p JOIN billing_features f ON f.id=p.feature_id
     WHERE p.subscriber_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND f.key='vehicle_lookup') AS paczki_firmy;

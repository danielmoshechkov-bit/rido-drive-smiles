-- Zachowanie `moze_pracowac` po wariancie A, krok 1.
--
-- Sedno: okres próbny w `billing_subscriptions` ma się KOŃCZYĆ, a wiersz płatny
-- ma nadal wygrywać z `paid_service_subscriptions` — bez podwójnego liczenia.
\set QUIET on
\pset footer off
SET client_min_messages = warning;

BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a@t.pl'),
  ('22222222-2222-2222-2222-222222222222', 'b@t.pl'),
  ('33333333-3333-3333-3333-333333333333', 'c@t.pl'),
  ('44444444-4444-4444-4444-444444444444', 'd@t.pl'),
  ('55555555-5555-5555-5555-555555555555', 'e@t.pl'),
  ('66666666-6666-6666-6666-666666666666', 'f@t.pl'),
  ('77777777-7777-7777-7777-777777777777', 'g@t.pl');

INSERT INTO public.billing_plans (id, code, name, product_line, price_net)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'trial_warsztat', 'Próbny', 'warsztat', 0);

-- Siedem warsztatów, każdy w innym stanie.
INSERT INTO public.service_providers (id, user_id, company_name) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','trial trwa'),
  ('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','trial minal'),
  ('bbbbbbbb-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','trial bez daty'),
  ('bbbbbbbb-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','oplacony'),
  ('bbbbbbbb-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','karencja'),
  ('bbbbbbbb-0000-0000-0000-000000000006','66666666-6666-6666-6666-666666666666','anulowany'),
  ('bbbbbbbb-0000-0000-0000-000000000007','77777777-7777-7777-7777-777777777777','bez wiersza');

INSERT INTO public.billing_subscriptions
  (subscriber_type, subscriber_id, plan_id, status, product_line, trial_ends_at, current_period_end)
VALUES
  ('service_provider','bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','trialing','warsztat', now() + interval '5 days', NULL),
  ('service_provider','bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','trialing','warsztat', now() - interval '1 day',  NULL),
  ('service_provider','bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','trialing','warsztat', NULL, NULL),
  ('service_provider','bbbbbbbb-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','active','warsztat',   NULL, now() - interval '3 days'),
  ('service_provider','bbbbbbbb-0000-0000-0000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','past_due','warsztat', NULL, NULL),
  ('service_provider','bbbbbbbb-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000001','canceled','warsztat', NULL, NULL);

-- KLUCZOWE: warsztat 2 ma RÓWNIEŻ ważny trial w starej tabeli. Gdyby gałąź
-- zapasowa go „doliczyła", wygasły okres próbny dawałby dostęp mimo wszystko.
INSERT INTO public.paid_service_subscriptions (user_id, status, expires_at) VALUES
  ('22222222-2222-2222-2222-222222222222', 'trial', now() + interval '30 days'),
  ('77777777-7777-7777-7777-777777777777', 'trial', now() + interval '10 days');

\pset tuples_only off
SELECT
  sp.company_name AS przypadek,
  public.moze_pracowac(sp.id, 'warsztat') AS wynik,
  CASE sp.company_name
    WHEN 'trial trwa'      THEN true
    WHEN 'trial minal'     THEN false   -- data minela: NIE ratuje go stary wiersz
    WHEN 'trial bez daty'  THEN true    -- wiersze sprzed terminow zostaja
    WHEN 'oplacony'        THEN true    -- 'active' nie wygasa po dacie (Stripe)
    WHEN 'karencja'        THEN true    -- past_due przepuszcza, operator ponawia
    WHEN 'anulowany'       THEN false
    WHEN 'bez wiersza'     THEN true    -- galaz zapasowa: waznny trial w starej tabeli
  END AS oczekiwane
FROM public.service_providers sp
ORDER BY sp.company_name;

DO $$
DECLARE v_zle text;
BEGIN
  SELECT string_agg(company_name, ', ') INTO v_zle FROM (
    SELECT sp.company_name FROM public.service_providers sp
    WHERE public.moze_pracowac(sp.id, 'warsztat') <> CASE sp.company_name
      WHEN 'trial trwa' THEN true WHEN 'trial minal' THEN false
      WHEN 'trial bez daty' THEN true WHEN 'oplacony' THEN true
      WHEN 'karencja' THEN true WHEN 'anulowany' THEN false
      WHEN 'bez wiersza' THEN true END
  ) q;
  IF v_zle IS NOT NULL THEN
    RAISE EXCEPTION 'NIEZGODNE: %', v_zle;
  END IF;
  RAISE NOTICE 'WSZYSTKIE SIEDEM PRZYPADKOW ZGODNYCH';
END $$;

ROLLBACK;

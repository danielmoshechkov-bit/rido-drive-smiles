\set QUIET on
SET client_min_messages = notice;
BEGIN;
DO $$
DECLARE v_ok text := ''; v_zle text := ''; v_zam uuid; v_sub billing_subscriptions%ROWTYPE;
        v_plan uuid; v_prov uuid := 'bbbb0000-0000-0000-0000-000000000002'; v_bylo timestamptz;
BEGIN
  SELECT id INTO v_plan FROM billing_plans WHERE code='warsztat_pro';

  -- 1. ROK dodaje dwanascie miesiecy (przypadek, ktory MA sie udac)
  UPDATE billing_subscriptions SET status='trialing', current_period_end = NULL,
         dokanczanie_do = now() + interval '2 days', dokanczanie_powod='trial'
    WHERE subscriber_id = v_prov;
  INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross, status, provider, snapshot)
  VALUES ('service_provider', v_prov, v_plan, 2078.70, 'oplacone', 'payu',
          jsonb_build_object('okres','rok','miesiecy',12)) RETURNING id INTO v_zam;
  PERFORM public.billing_wydaj_okres(v_zam);
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.current_period_end BETWEEN now() + interval '360 days' AND now() + interval '370 days'
    THEN v_ok := v_ok || E'\n  OK   rok dodaje 12 miesiecy (do ' || v_sub.current_period_end::date || ')';
    ELSE v_zle := v_zle || E'\n  BLAD rok dodal do ' || v_sub.current_period_end::date; END IF;

  -- 2. tryb dokonczenia wyczyszczony takze przy roku
  IF v_sub.dokanczanie_do IS NULL THEN v_ok := v_ok || E'\n  OK   rok czysci tryb dokonczenia';
  ELSE v_zle := v_zle || E'\n  BLAD tryb dokonczenia zostal'; END IF;

  -- 3. MIESIAC do trwajacego roku DOLICZA sie, nie zastepuje
  v_bylo := v_sub.current_period_end;
  INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross, status, provider, snapshot)
  VALUES ('service_provider', v_prov, v_plan, 207.87, 'oplacone', 'payu',
          jsonb_build_object('okres','miesiac','miesiecy',1)) RETURNING id INTO v_zam;
  PERFORM public.billing_wydaj_okres(v_zam);
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.current_period_end > v_bylo + interval '27 days'
    THEN v_ok := v_ok || E'\n  OK   miesiac doliczony do konca roku, nie zastapil';
    ELSE v_zle := v_zle || E'\n  BLAD miesiac zastapil rok'; END IF;

  -- 4. ZAMOWIENIE BEZ 'miesiecy' (sprzed wprowadzenia roku) = jeden miesiac
  v_bylo := v_sub.current_period_end;
  INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross, status, provider, snapshot)
  VALUES ('service_provider', v_prov, v_plan, 207.87, 'oplacone', 'payu', '{"rodzaj":"miesiac_planu"}'::jsonb)
  RETURNING id INTO v_zam;
  PERFORM public.billing_wydaj_okres(v_zam);
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.current_period_end BETWEEN v_bylo + interval '27 days' AND v_bylo + interval '32 days'
    THEN v_ok := v_ok || E'\n  OK   stare zamowienie bez pola = jeden miesiac';
    ELSE v_zle := v_zle || E'\n  BLAD stare zamowienie: ' || v_sub.current_period_end::date; END IF;

  -- 5. idempotencja przy roku
  v_bylo := v_sub.current_period_end;
  PERFORM public.billing_wydaj_okres(v_zam);
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.current_period_end = v_bylo THEN v_ok := v_ok || E'\n  OK   powtorzenie nie przedluza';
  ELSE v_zle := v_zle || E'\n  BLAD powtorzenie przedluzylo'; END IF;

  -- 6. nakladka pod stara nazwa dziala tak samo
  INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross, status, provider, snapshot)
  VALUES ('service_provider', v_prov, v_plan, 2078.70, 'oplacone', 'payu',
          jsonb_build_object('okres','rok','miesiecy',12)) RETURNING id INTO v_zam;
  v_bylo := v_sub.current_period_end;
  PERFORM public.billing_wydaj_miesiac(v_zam);
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.current_period_end > v_bylo + interval '360 days'
    THEN v_ok := v_ok || E'\n  OK   nakladka billing_wydaj_miesiac wydaje ROK poprawnie';
    ELSE v_zle := v_zle || E'\n  BLAD nakladka: ' || v_sub.current_period_end::date; END IF;

  RAISE NOTICE '%', v_ok;
  IF v_zle <> '' THEN RAISE EXCEPTION '%', v_zle; END IF;
  RAISE NOTICE 'WSZYSTKIE SZESC PRZYPADKOW ZGODNYCH';
END $$;
ROLLBACK;

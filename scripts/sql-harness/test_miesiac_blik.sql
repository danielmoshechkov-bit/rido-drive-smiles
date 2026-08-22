\set QUIET on
SET client_min_messages = notice;
BEGIN;
DO $$
DECLARE v_ok text := ''; v_zle text := ''; v_zam uuid; v_sub billing_subscriptions%ROWTYPE;
        v_plan uuid; v_prov uuid := 'bbbb0000-0000-0000-0000-000000000002'; n int;
BEGIN
  SELECT id INTO v_plan FROM billing_plans WHERE code='warsztat_pro';
  UPDATE billing_subscriptions SET status='trialing', dokanczanie_do = now() + interval '2 days',
         dokanczanie_powod='trial', current_period_end = now() - interval '1 day',
         price_guarantee_until = NULL
    WHERE subscriber_id = v_prov;

  INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross, status, provider, snapshot)
  VALUES ('service_provider', v_prov, v_plan, 207.87, 'oplacone', 'payu', '{"rodzaj":"miesiac_planu"}'::jsonb)
  RETURNING id INTO v_zam;

  -- 1. wydanie miesiaca (przypadek, ktory MA sie udac)
  PERFORM public.billing_wydaj_miesiac(v_zam);
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.status::text='active' AND v_sub.current_period_end > now() + interval '27 days'
    THEN v_ok := v_ok || E'\n  OK   miesiac wydany: status active, okres do ' || v_sub.current_period_end::date;
    ELSE v_zle := v_zle || E'\n  BLAD po wydaniu: ' || v_sub.status || ' do ' || COALESCE(v_sub.current_period_end::text,'NULL'); END IF;

  -- 2. tryb dokonczenia wyczyszczony
  IF v_sub.dokanczanie_do IS NULL AND v_sub.dokanczanie_powod IS NULL
    THEN v_ok := v_ok || E'\n  OK   oplacenie wyczyscilo tryb dokonczenia';
    ELSE v_zle := v_zle || E'\n  BLAD tryb dokonczenia zostal po oplaceniu'; END IF;

  -- 3. gwarancja ceny ustawiona przy pierwszym zakupie
  IF v_sub.price_guarantee_until > now() + interval '360 days'
    THEN v_ok := v_ok || E'\n  OK   gwarancja ceny na 12 miesiecy';
    ELSE v_zle := v_zle || E'\n  BLAD gwarancja: ' || COALESCE(v_sub.price_guarantee_until::text,'NULL'); END IF;

  -- 4. IDEMPOTENCJA: powtorzone powiadomienie nie przedluza drugi raz
  DECLARE v_koniec timestamptz := v_sub.current_period_end;
  BEGIN
    PERFORM public.billing_wydaj_miesiac(v_zam);
    SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
    IF v_sub.current_period_end = v_koniec
      THEN v_ok := v_ok || E'\n  OK   powtorzone powiadomienie nie przedluza';
      ELSE v_zle := v_zle || E'\n  BLAD powtorzenie przedluzylo miesiac'; END IF;
  END;

  -- 5. nieoplacone zamowienie nie da sie wydac
  INSERT INTO billing_orders (subscriber_type, subscriber_id, plan_id, amount_gross, status, provider)
  VALUES ('service_provider', v_prov, v_plan, 207.87, 'nowe', 'payu') RETURNING id INTO v_zam;
  BEGIN
    PERFORM public.billing_wydaj_miesiac(v_zam);
    v_zle := v_zle || E'\n  BLAD wydano miesiac za NIEOPLACONE zamowienie';
  EXCEPTION WHEN others THEN
    v_ok := v_ok || E'\n  OK   nieoplacone zamowienie odmawia wydania';
  END;

  -- 6. wygasniecie miesiaca wprowadza w tryb dokonczenia
  UPDATE billing_subscriptions SET current_period_end = now() - interval '1 minute',
         dokanczanie_do = NULL WHERE subscriber_id = v_prov;
  n := public.billing_konczy_sie_miesiac();
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF n = 1 AND v_sub.dokanczanie_do > now() AND v_sub.dokanczanie_powod='platnosc'
    THEN v_ok := v_ok || E'\n  OK   po miesiacu wchodzi w tryb dokonczenia';
    ELSE v_zle := v_zle || E'\n  BLAD po miesiacu: n=' || n; END IF;

  -- 7. subskrypcje Stripe NIE sa wygaszane ta droga
  UPDATE billing_subscriptions SET provider='stripe', status='active',
         current_period_end = now() - interval '5 days', dokanczanie_do = NULL
    WHERE subscriber_id = v_prov;
  n := public.billing_konczy_sie_miesiac();
  SELECT * INTO v_sub FROM billing_subscriptions WHERE subscriber_id = v_prov;
  IF v_sub.dokanczanie_do IS NULL
    THEN v_ok := v_ok || E'\n  OK   subskrypcja Stripe nietknieta';
    ELSE v_zle := v_zle || E'\n  BLAD wygaszono subskrypcje Stripe'; END IF;

  RAISE NOTICE '%', v_ok;
  IF v_zle <> '' THEN RAISE EXCEPTION '%', v_zle; END IF;
  RAISE NOTICE 'WSZYSTKIE SIEDEM PRZYPADKOW ZGODNYCH';
END $$;
ROLLBACK;

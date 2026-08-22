-- Wejscie w tryb dokonczenia i wyjscie z niego — oba powody.
-- Kazdy przypadek ma jawne oczekiwanie, w tym takie, ktore MA sie udac.
\set QUIET on
SET client_min_messages = notice;
BEGIN;
DO $$
DECLARE v_ok text := ''; v_zle text := ''; v_do timestamptz; v_powod text; v_st text; n int;
BEGIN
  -- Czysty punkt wyjscia
  UPDATE billing_subscriptions SET dokanczanie_do=NULL, dokanczanie_powod=NULL;

  -- 1. NIEUDANA PLATNOSC: przejscie na past_due wchodzi w tryb
  UPDATE billing_subscriptions SET status='past_due'
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000005';
  SELECT dokanczanie_do, dokanczanie_powod INTO v_do, v_powod
    FROM billing_subscriptions WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000005';
  IF v_do > now() AND v_powod='platnosc'
    THEN v_ok := v_ok || E'\n  OK   nieudana platnosc wchodzi w tryb (powod: platnosc)';
    ELSE v_zle := v_zle || E'\n  BLAD platnosc: do=' || COALESCE(v_do::text,'NULL') || ' powod=' || COALESCE(v_powod,'NULL'); END IF;

  -- 2. PONOWIENIE: drugie past_due NIE przesuwa terminu
  DECLARE v_pierwszy timestamptz := v_do;
  BEGIN
    UPDATE billing_subscriptions SET status='past_due', updated_at=now()
      WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000005';
    SELECT dokanczanie_do INTO v_do FROM billing_subscriptions
      WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000005';
    IF v_do = v_pierwszy THEN v_ok := v_ok || E'\n  OK   ponowne odrzucenie nie przesuwa terminu';
    ELSE v_zle := v_zle || E'\n  BLAD ponowienie przesunelo termin'; END IF;
  END;

  -- 3. OPLACENIE: powrot na active czysci tryb  (przypadek, ktory MA sie udac)
  UPDATE billing_subscriptions SET status='active'
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000005';
  SELECT dokanczanie_do, dokanczanie_powod INTO v_do, v_powod
    FROM billing_subscriptions WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000005';
  IF v_do IS NULL AND v_powod IS NULL
    THEN v_ok := v_ok || E'\n  OK   oplacenie czysci tryb dokonczenia natychmiast';
    ELSE v_zle := v_zle || E'\n  BLAD po oplaceniu tryb zostal'; END IF;

  -- 4. KONIEC OKRESU PROBNEGO: zadanie wprowadza w tryb
  UPDATE billing_subscriptions SET status='trialing', trial_ends_at = now() - interval '1 day'
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000001';
  n := public.billing_konczy_sie_trial();
  SELECT dokanczanie_do, dokanczanie_powod INTO v_do, v_powod
    FROM billing_subscriptions WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000001';
  IF v_do > now() AND v_powod='trial'
    THEN v_ok := v_ok || E'\n  OK   koniec okresu probnego wchodzi w tryb (powod: trial)';
    ELSE v_zle := v_zle || E'\n  BLAD trial: do=' || COALESCE(v_do::text,'NULL'); END IF;

  -- 5. IDEMPOTENCJA zadania
  n := public.billing_konczy_sie_trial();
  IF n = 0 THEN v_ok := v_ok || E'\n  OK   powtorne zadanie nie rusza nikogo (0 wierszy)';
  ELSE v_zle := v_zle || E'\n  BLAD powtorne zadanie ruszylo ' || n; END IF;

  -- 6. OKRES PROBNY BEZ DATY zostaje nietkniety
  SELECT dokanczanie_do INTO v_do FROM billing_subscriptions
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000003';
  IF v_do IS NULL THEN v_ok := v_ok || E'\n  OK   okres probny bez daty nietkniety';
  ELSE v_zle := v_zle || E'\n  BLAD bezterminowy trial wszedl w tryb'; END IF;

  -- 7. TWARDY BLOK po uplywie terminu
  UPDATE billing_subscriptions SET dokanczanie_do = now() - interval '1 minute'
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000001';
  n := public.billing_zejdz_do_read_only();
  SELECT status::text INTO v_st FROM billing_subscriptions
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000001';
  IF v_st='read_only' THEN v_ok := v_ok || E'\n  OK   po terminie schodzi na twardy blok';
  ELSE v_zle := v_zle || E'\n  BLAD po terminie status=' || v_st; END IF;

  -- 8. TRWAJACY tryb NIE schodzi na blok
  UPDATE billing_subscriptions SET status='past_due', dokanczanie_do=NULL
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000006';
  n := public.billing_zejdz_do_read_only();
  SELECT status::text INTO v_st FROM billing_subscriptions
    WHERE subscriber_id='bbbb0000-0000-0000-0000-000000000006';
  IF v_st='past_due' THEN v_ok := v_ok || E'\n  OK   trwajacy tryb nie schodzi na blok';
  ELSE v_zle := v_zle || E'\n  BLAD trwajacy tryb zszedl na ' || v_st; END IF;

  RAISE NOTICE '%', v_ok;
  IF v_zle <> '' THEN RAISE EXCEPTION '%', v_zle; END IF;
  RAISE NOTICE 'WSZYSTKIE OSIEM PRZYPADKOW ZGODNYCH';
END $$;
ROLLBACK;

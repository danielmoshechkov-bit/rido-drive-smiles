-- ═══════════════════════════════════════════════════════════════════════════
-- DNI DOSTĘPU PRZYZNAWANE Z PANELU ADMINISTRATORA
-- ═══════════════════════════════════════════════════════════════════════════
-- Trzy sytuacje, w których jest potrzebne, i wszystkie trzy są prawdziwe:
--   • przedłużenie okresu próbnego komuś, kto testuje i potrzebuje więcej czasu,
--   • dostęp dla znajomego warsztatu bez przechodzenia przez płatność,
--   • naprawa sytuacji, w której klient zapłacił, a coś nie zadziałało.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- OD KIEDY LICZYMY — DOKLEJAMY, NIE ZASTĘPUJEMY
-- ═══════════════════════════════════════════════════════════════════════════
-- Nowy koniec okresu to `GREATEST(obecny koniec, teraz) + dni`. Ta sama zasada
-- co przy zakupie okresu (`billing_wydaj_okres`) i z tego samego powodu:
-- przyznanie dni komuś, kto ma jeszcze dwa tygodnie opłacone, NIE MOŻE mu ich
-- zabrać. Liczenie „od teraz" skracałoby dostęp przy każdym geście dobrej woli
-- — i to bez śladu, bo nikt nie sprawdza daty przed kliknięciem.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO JESZCZE ROBI, POZA DATĄ
-- ═══════════════════════════════════════════════════════════════════════════
-- • `status = 'active'` — inaczej konto po twardym bloku zostałoby zablokowane
--   mimo ważnej daty;
-- • `dokanczanie_do = NULL` i `dokanczanie_powod = NULL` — tryb dokończenia ma
--   zniknąć, bo właśnie po to się dni przyznaje;
-- • `trial_ends_at = NULL` — zostawiona data próbna wysyłałaby ostrzeżenie
--   „kończy Ci się dostęp" w środku przyznanego okresu (ten błąd już był);
-- • wpis do `billing_audit_log`: kto, komu, ile dni, od kiedy do kiedy, powód.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO NIE ROBI
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 NIE ZAKŁADA subskrypcji tam, gdzie jej nie ma. Wiersz wymaga `plan_id`,
-- a wybór planu za administratora to zgadywanie, za które potem płaci klient
-- (dostałby zakres, którego nikt mu nie obiecał). Brak wiersza kończy się
-- czytelną odmową: „najpierw wybierz plan dla tego konta".
--
-- 🔴 NIE DOTYKA operatora płatności. To jest dostęp z ręki, nie subskrypcja —
-- `provider` zostaje taki, jaki był. Konto ze Stripe'em nadal odnowi się samo,
-- a przyznane dni tylko przesuwają koniec okresu do przodu.
--
-- 🔴 NIE PRZYJMUJE mniej niż 1 i więcej niż 365 dni. Pomyłka w polu nie może
-- dać komuś dostępu na dziesięć lat, a odmowa jest tu tańsza niż cofanie.

BEGIN;

CREATE OR REPLACE FUNCTION public.billing_przyznaj_dni_admin(
  p_subscriber_id uuid,
  p_linia         text,
  p_dni           integer,
  p_powod         text    DEFAULT NULL,
  p_actor         uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funkcja$
DECLARE
  v_sub    billing_subscriptions%ROWTYPE;
  v_od     timestamptz;
  v_do     timestamptz;
  v_linia  billing_product_line;
BEGIN
  IF p_dni IS NULL OR p_dni < 1 OR p_dni > 365 THEN
    RAISE EXCEPTION 'ZLA_LICZBA_DNI: podano %, dozwolone 1–365', p_dni
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_linia := p_linia::billing_product_line;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'ZLA_LINIA: %', p_linia USING ERRCODE = 'check_violation';
  END;

  SELECT * INTO v_sub
  FROM billing_subscriptions
  WHERE subscriber_type = 'service_provider'
    AND subscriber_id   = p_subscriber_id
    AND product_line    = v_linia
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'BRAK_SUBSKRYPCJI: konto % nie ma wiersza w linii % — najpierw wybierz dla niego plan',
      p_subscriber_id, p_linia USING ERRCODE = 'no_data_found';
  END IF;

  v_od := now();
  v_do := GREATEST(COALESCE(v_sub.current_period_end, now()), now()) + make_interval(days => p_dni);

  UPDATE billing_subscriptions
  SET status               = 'active',
      current_period_end   = v_do,
      trial_ends_at        = NULL,
      dokanczanie_do       = NULL,
      dokanczanie_powod    = NULL,
      updated_at           = now()
  WHERE id = v_sub.id;

  INSERT INTO billing_audit_log (actor_id, action, target_table, target_id, before, after)
  VALUES (
    p_actor,
    'subscription.dni_przyznane',
    'billing_subscriptions',
    v_sub.id,
    jsonb_build_object(
      'status', v_sub.status,
      'current_period_end', v_sub.current_period_end,
      'dokanczanie_do', v_sub.dokanczanie_do,
      'trial_ends_at', v_sub.trial_ends_at
    ),
    jsonb_build_object(
      'status', 'active',
      'current_period_end', v_do,
      'dni', p_dni,
      'linia', p_linia,
      'powod', p_powod,
      'przyznano_at', v_od
    )
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'linia', p_linia,
    'dni', p_dni,
    'poprzedni_koniec', v_sub.current_period_end,
    'nowy_koniec', v_do
  );
END;
$funkcja$;

REVOKE ALL ON FUNCTION public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — Z PRZYPADKIEM, KTÓRY MA SIĘ UDAĆ, I TAKIMI, KTÓRE MAJĄ ODMÓWIĆ
-- ═══════════════════════════════════════════════════════════════════════════
DO $kontrola$
DECLARE
  v_provider uuid := gen_random_uuid();
  v_plan     uuid;
  v_sub      uuid := gen_random_uuid();
  v_wynik    jsonb;
  v_po       billing_subscriptions%ROWTYPE;
  v_odmowy   int := 0;
BEGIN
  SELECT id INTO v_plan FROM billing_plans WHERE code = 'warsztat_standard';
  IF v_plan IS NULL THEN RAISE EXCEPTION 'kontrola: brak planu warsztat_standard'; END IF;

  INSERT INTO service_providers (id, company_name) VALUES (v_provider, 'PRÓBA DNI DOSTĘPU');

  -- konto po TWARDYM BLOKU: okres skończony, tryb dokończenia ustawiony
  INSERT INTO billing_subscriptions
    (id, subscriber_type, subscriber_id, plan_id, status, product_line,
     current_period_start, current_period_end, dokanczanie_do, dokanczanie_powod, trial_ends_at, price_snapshot)
  VALUES
    (v_sub, 'service_provider', v_provider, v_plan, 'read_only', 'warsztat',
     now() - interval '60 days', now() - interval '10 days',
     now() - interval '3 days', 'okres próbny', now() - interval '10 days', '{}'::jsonb);

  -- 1. PRZYPADEK, KTÓRY MA SIĘ UDAĆ
  v_wynik := public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 14, 'kontrola migracji', NULL);
  SELECT * INTO v_po FROM billing_subscriptions WHERE id = v_sub;

  IF v_po.status::text <> 'active' THEN
    RAISE EXCEPTION 'kontrola: status po przyznaniu to %, ma być active', v_po.status;
  END IF;
  IF v_po.dokanczanie_do IS NOT NULL OR v_po.dokanczanie_powod IS NOT NULL THEN
    RAISE EXCEPTION 'kontrola: tryb dokończenia nie został wyczyszczony';
  END IF;
  IF v_po.trial_ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'kontrola: data próbna została, ostrzeżenie poszłoby w środku okresu';
  END IF;
  -- okres był PRZETERMINOWANY, więc liczymy od teraz: 14 dni ± doba
  IF v_po.current_period_end < now() + interval '13 days'
     OR v_po.current_period_end > now() + interval '15 days' THEN
    RAISE EXCEPTION 'kontrola: nowy koniec okresu to %, spodziewane ~14 dni od teraz', v_po.current_period_end;
  END IF;

  -- 2. DOKLEJANIE: drugie przyznanie ma DODAĆ do ważnej daty, nie skrócić
  v_wynik := public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 7, NULL, NULL);
  SELECT * INTO v_po FROM billing_subscriptions WHERE id = v_sub;
  IF v_po.current_period_end < now() + interval '20 days' THEN
    RAISE EXCEPTION 'kontrola: doklejanie nie działa — po 14+7 dniach koniec to %', v_po.current_period_end;
  END IF;

  -- 3. ODMOWY
  BEGIN
    PERFORM public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 0, NULL, NULL);
    RAISE EXCEPTION 'kontrola: zero dni PRZESZŁO, a miało odmówić';
  EXCEPTION WHEN check_violation THEN v_odmowy := v_odmowy + 1;
  END;
  BEGIN
    PERFORM public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 366, NULL, NULL);
    RAISE EXCEPTION 'kontrola: 366 dni PRZESZŁO, a miało odmówić';
  EXCEPTION WHEN check_violation THEN v_odmowy := v_odmowy + 1;
  END;
  BEGIN
    PERFORM public.billing_przyznaj_dni_admin(v_provider, 'agent', 10, NULL, NULL);
    RAISE EXCEPTION 'kontrola: linia bez subskrypcji PRZESZŁA, a miała odmówić';
  EXCEPTION WHEN no_data_found THEN v_odmowy := v_odmowy + 1;
  END;
  IF v_odmowy <> 3 THEN
    RAISE EXCEPTION 'kontrola: odmów było %, miały być 3', v_odmowy;
  END IF;

  -- 4. ŚLAD W KSIĘDZE — dwa udane przyznania, dwa wpisy
  IF (SELECT count(*) FROM billing_audit_log
      WHERE action = 'subscription.dni_przyznane' AND target_id = v_sub) <> 2 THEN
    RAISE EXCEPTION 'kontrola: w księdze zdarzeń nie ma dwóch wpisów';
  END IF;

  DELETE FROM billing_audit_log WHERE target_id = v_sub;
  DELETE FROM billing_subscriptions WHERE id = v_sub;
  DELETE FROM service_providers WHERE id = v_provider;

  RAISE NOTICE 'Kontrola przeszła: przyznanie, doklejanie, trzy odmowy, ślad w księdze.';
END;
$kontrola$;

COMMIT;

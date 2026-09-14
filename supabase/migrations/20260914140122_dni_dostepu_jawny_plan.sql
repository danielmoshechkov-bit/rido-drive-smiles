-- ═══════════════════════════════════════════════════════════════════════════
-- PRZYZNANIE DNI KONTU BEZ SUBSKRYPCJI WYMAGA JAWNEGO WYBORU PLANU
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 TA MIGRACJA ZASTĘPUJE `20260914001000_dni_dostepu_bez_subskrypcji.sql`.
-- Tamtej NIE URUCHAMIAJ — ma pięcioargumentową sygnaturę, a ta ma sześć.
-- Wykonanie jej PO tej migracji założyłoby DRUGĄ funkcję o tej samej nazwie
-- i każde wywołanie z pięcioma argumentami stałoby się niejednoznaczne.
-- Kontrola na końcu tego pliku tego pilnuje: funkcja ma być dokładnie jedna.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO BYŁO NIE TAK
-- ═══════════════════════════════════════════════════════════════════════════
-- Wariant z `20260914001000` słusznie pozwalał przyznać dni kontu, które nic
-- nie kupiło — to jest najczęstszy przypadek nadania. Ale plan wybierał SAM:
--
--   SELECT * FROM billing_plans WHERE product_line = v_linia
--     AND is_active AND NOT is_custom AND price_net > 0
--   ORDER BY price_net ASC LIMIT 1
--
-- czyli NAJTAŃSZY. W linii warsztatowej to Standard. Administrator, który
-- chciał dać znajomemu warsztatowi „trzydzieści dni", dawał trzydzieści dni
-- STANDARDU, przekonany, że daje Pro — a dowiadywał się o tym dopiero wtedy,
-- gdy klient zapytał, czemu nie ma panelu pracowników.
--
-- Zwracana `uwaga` mówiła, który plan założono, ale to jest wiadomość PO
-- fakcie, w komunikacie, który znika po kilku sekundach.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO ROBI TA WERSJA
-- ═══════════════════════════════════════════════════════════════════════════
-- • konto MA subskrypcję w tej linii → przedłużamy ją, `p_plan_code` jest
--   zbędny i zignorowany. Plan zmienia się osobną czynnością, nie przy okazji
--   dawania dni;
-- • konto NIE MA subskrypcji, a plan PODANO → zakładamy wiersz na tym planie;
-- • konto NIE MA subskrypcji i planu NIE PODANO → **odmowa `WYBIERZ_PLAN`**
--   z listą kodów do wyboru w treści wyjątku. Nie zgadujemy.
--
-- Zasada jest ta sama, co przy rodzaju nabywcy: koszt pomyłki jest
-- niesymetryczny. Zgadnięty plan to zakres, którego nikt klientowi nie
-- obiecał; odmowa to jedno pole więcej w formularzu.

BEGIN;

-- Stara sygnatura (pięcioargumentowa) znika, żeby nie było dwóch funkcji
-- o tej samej nazwie — przy `DEFAULT`-ach wywołanie stałoby się niejednoznaczne.
DROP FUNCTION IF EXISTS public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid);

CREATE OR REPLACE FUNCTION public.billing_przyznaj_dni_admin(
  p_subscriber_id uuid,
  p_linia         text,
  p_dni           integer,
  p_powod         text    DEFAULT NULL,
  p_actor         uuid    DEFAULT NULL,
  p_plan_code     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funkcja$
DECLARE
  v_sub    billing_subscriptions%ROWTYPE;
  v_plan   billing_plans%ROWTYPE;
  v_od     timestamptz;
  v_do     timestamptz;
  v_linia  billing_product_line;
  v_lista  text;
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

  -- ── KONTO BEZ SUBSKRYPCJI W TEJ LINII ────────────────────────────────────
  IF v_sub.id IS NULL THEN
    IF p_plan_code IS NULL OR btrim(p_plan_code) = '' THEN
      SELECT string_agg(code, ', ' ORDER BY price_net) INTO v_lista
      FROM billing_plans
      WHERE product_line = v_linia AND is_active AND NOT is_custom AND coalesce(price_net, 0) > 0;

      RAISE EXCEPTION 'WYBIERZ_PLAN: konto nie ma subskrypcji w linii % — wskaż plan. Do wyboru: %',
        p_linia, coalesce(v_lista, '(brak aktywnych planów płatnych)')
        USING ERRCODE = 'no_data_found';
    END IF;

    SELECT * INTO v_plan FROM billing_plans
    WHERE code = btrim(p_plan_code) AND product_line = v_linia AND is_active AND NOT is_custom;

    IF v_plan.id IS NULL THEN
      RAISE EXCEPTION 'ZLY_PLAN: plan % nie istnieje, nie jest aktywny albo nie należy do linii %',
        p_plan_code, p_linia USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status, provider,
       current_period_start, current_period_end, price_snapshot)
    VALUES
      ('service_provider', p_subscriber_id, v_plan.id, 'active', NULL,
       now(), now() + make_interval(days => p_dni),
       jsonb_build_object('zrodlo', 'nadanie_admin', 'plan', v_plan.code, 'powod', p_powod))
    RETURNING * INTO v_sub;

    INSERT INTO billing_audit_log (actor_id, action, target_table, target_id, before, after)
    VALUES (p_actor, 'subscription.dni_przyznane_nowa', 'billing_subscriptions', v_sub.id, NULL,
            jsonb_build_object('linia', p_linia, 'plan', v_plan.code, 'dni', p_dni,
                               'powod', p_powod, 'do', v_sub.current_period_end));

    RETURN jsonb_build_object(
      'subscription_id', v_sub.id,
      'plan', v_plan.code,
      'linia', p_linia,
      'dni', p_dni,
      'poprzedni_koniec', NULL,
      'nowy_koniec', v_sub.current_period_end,
      'zalozono', true
    );
  END IF;

  -- ── KONTO Z SUBSKRYPCJĄ — DOKLEJAMY DNI ──────────────────────────────────
  SELECT * INTO v_plan FROM billing_plans WHERE id = v_sub.plan_id;

  v_od := now();
  v_do := GREATEST(COALESCE(v_sub.current_period_end, now()), now()) + make_interval(days => p_dni);

  UPDATE billing_subscriptions
  SET status             = 'active',
      current_period_end = v_do,
      trial_ends_at      = NULL,
      dokanczanie_do     = NULL,
      dokanczanie_powod  = NULL,
      updated_at         = now()
  WHERE id = v_sub.id;

  INSERT INTO billing_audit_log (actor_id, action, target_table, target_id, before, after)
  VALUES (
    p_actor, 'subscription.dni_przyznane', 'billing_subscriptions', v_sub.id,
    jsonb_build_object('status', v_sub.status, 'current_period_end', v_sub.current_period_end,
                       'dokanczanie_do', v_sub.dokanczanie_do, 'trial_ends_at', v_sub.trial_ends_at),
    jsonb_build_object('status', 'active', 'current_period_end', v_do, 'dni', p_dni,
                       'linia', p_linia, 'powod', p_powod, 'przyznano_at', v_od)
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    -- Plan, KTÓRY KONTO MA. Administrator widzi, czego właśnie przedłużył,
    -- zamiast zakładać, że przedłużył to, co miał na myśli.
    'plan', v_plan.code,
    'linia', p_linia,
    'dni', p_dni,
    'poprzedni_koniec', v_sub.current_period_end,
    'nowy_koniec', v_do,
    'zalozono', false,
    'uwaga', CASE WHEN v_sub.provider_subscription_id IS NOT NULL
                  THEN 'Konto ma subskrypcję u operatora — przy najbliższym odnowieniu data zostanie nadpisana przez Stripe.'
                  ELSE NULL END
  );
END;
$funkcja$;

REVOKE ALL ON FUNCTION public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA
-- ═══════════════════════════════════════════════════════════════════════════
DO $kontrola$
DECLARE
  v_provider uuid := gen_random_uuid();
  v_plan_pro uuid;
  v_wynik    jsonb;
  v_sub      billing_subscriptions%ROWTYPE;
  v_odmowy   int := 0;
  v_ile_funkcji int;
BEGIN
  -- 0. FUNKCJA MA BYĆ JEDNA. Dwie sygnatury = niejednoznaczne wywołanie.
  SELECT count(*) INTO v_ile_funkcji FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'billing_przyznaj_dni_admin';
  IF v_ile_funkcji <> 1 THEN
    RAISE EXCEPTION 'kontrola: funkcji billing_przyznaj_dni_admin jest %, ma być 1 (czy uruchomiono 20260914001000?)', v_ile_funkcji;
  END IF;

  SELECT id INTO v_plan_pro FROM billing_plans WHERE code = 'warsztat_pro';
  IF v_plan_pro IS NULL THEN RAISE EXCEPTION 'kontrola: brak planu warsztat_pro'; END IF;

  INSERT INTO service_providers (id, company_name) VALUES (v_provider, 'PRÓBA JAWNY PLAN');

  -- 1. BEZ PLANU → ODMOWA. To jest cała ta migracja.
  BEGIN
    PERFORM public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 30, NULL, NULL, NULL);
    RAISE EXCEPTION 'kontrola: przyznanie BEZ planu przeszło, a miało odmówić';
  EXCEPTION WHEN no_data_found THEN v_odmowy := v_odmowy + 1;
  END;

  -- 2. ZŁY PLAN → ODMOWA (plan z innej linii)
  BEGIN
    PERFORM public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 30, NULL, NULL, 'agent');
    RAISE EXCEPTION 'kontrola: plan z innej linii przeszedł, a miał odmówić';
  EXCEPTION WHEN check_violation THEN v_odmowy := v_odmowy + 1;
  END;

  -- 3. KONTROLA ODWROTNA: z JAWNYM planem MA się udać i ma to być TEN plan
  v_wynik := public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 30, 'kontrola', NULL, 'warsztat_pro');
  IF v_wynik ->> 'plan' <> 'warsztat_pro' THEN
    RAISE EXCEPTION 'kontrola: założono plan %, a wskazano warsztat_pro', v_wynik ->> 'plan';
  END IF;
  IF (v_wynik ->> 'zalozono')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'kontrola: wiersz nie został założony';
  END IF;

  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = (v_wynik ->> 'subscription_id')::uuid;
  IF v_sub.plan_id <> v_plan_pro THEN
    RAISE EXCEPTION 'kontrola: w bazie stoi inny plan niż wskazany';
  END IF;

  -- 4. DRUGIE PRZYZNANIE: konto MA już subskrypcję, plan ma zostać ten sam,
  --    a dni mają się dokleić — nawet gdy ktoś poda inny kod planu.
  v_wynik := public.billing_przyznaj_dni_admin(v_provider, 'warsztat', 10, NULL, NULL, 'warsztat_standard');
  IF v_wynik ->> 'plan' <> 'warsztat_pro' THEN
    RAISE EXCEPTION 'kontrola: przedłużenie PODMIENIŁO plan na %, a miało zostawić warsztat_pro', v_wynik ->> 'plan';
  END IF;
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = (v_wynik ->> 'subscription_id')::uuid;
  IF v_sub.current_period_end < now() + interval '39 days' THEN
    RAISE EXCEPTION 'kontrola: doklejanie nie zadziałało — koniec okresu to %', v_sub.current_period_end;
  END IF;

  IF v_odmowy <> 2 THEN
    RAISE EXCEPTION 'kontrola: odmów było %, miały być 2', v_odmowy;
  END IF;

  DELETE FROM billing_audit_log WHERE target_id = v_sub.id;
  DELETE FROM billing_subscriptions WHERE id = v_sub.id;
  DELETE FROM service_providers WHERE id = v_provider;

  RAISE NOTICE 'Kontrola przeszła: bez planu odmowa, zły plan odmowa, jawny plan zakłada, przedłużenie nie podmienia planu.';
END;
$kontrola$;

COMMIT;

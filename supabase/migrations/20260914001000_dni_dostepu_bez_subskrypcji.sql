-- ═══════════════════════════════════════════════════════════════════════════
-- DNI DOSTĘPU DLA KAŻDEGO KONTA, TAKŻE BEZ SUBSKRYPCJI (14.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decyzja właściciela: najczęstszy przypadek nadania to konto, które jeszcze
-- NIC NIE KUPIŁO — klient testowy, partner, reklamacja. Odmowa „najpierw
-- wybierz plan" kazała wtedy wejść do bazy ręcznie, czyli zrobić dokładnie to,
-- czego to narzędzie miało uniknąć.
--
-- Złożone z żywej definicji (`pg_get_functiondef`) z JEDNĄ podmianą i asercją,
-- że kotwica wystąpiła dokładnie raz — zasada z CLAUDE.md.

CREATE OR REPLACE FUNCTION public.billing_przyznaj_dni_admin(p_subscriber_id uuid, p_linia text, p_dni integer, p_powod text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub    billing_subscriptions%ROWTYPE;
  v_od     timestamptz;
  v_do     timestamptz;
  v_linia  billing_product_line;
  v_plan   billing_plans%ROWTYPE;
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

  /**
   * KONTO BEZ SUBSKRYPCJI DOSTAJE WIERSZ, A NIE ODMOWĘ (14.09.2026).
   *
   * Pierwsza wersja odmawiała: „najpierw wybierz plan". Powód był dobry —
   * wybór planu za administratora to zgadywanie zakresu, za który potem płaci
   * klient. Tyle że NAJCZĘSTSZY przypadek nadania to właśnie konto, które
   * jeszcze nic nie kupiło: klient testowy, partner, reklamacja. Odmowa
   * kazała wtedy wejść do bazy ręcznie — czyli dokładnie to, czego to
   * narzędzie miało uniknąć.
   *
   * Plan wybieramy NAJTAŃSZY PŁATNY w tej linii i zwracamy jego nazwę
   * w odpowiedzi, żeby administrator zobaczył, co właśnie nadał. Najtańszy,
   * nie najdroższy: gest handlowy ma dawać dostęp, a nie najwyższy pakiet,
   * którego nikt nie obiecywał.
   */
  IF v_sub.id IS NULL THEN
    SELECT * INTO v_plan FROM billing_plans
    WHERE product_line = v_linia
      AND is_active
      AND NOT is_custom
      AND COALESCE(price_net, 0) > 0
    ORDER BY price_net ASC
    LIMIT 1;

    IF v_plan.id IS NULL THEN
      RAISE EXCEPTION 'BRAK_PLANU: w linii % nie ma aktywnego płatnego planu, z którego dałoby się założyć dostęp',
        p_linia USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status, provider,
       current_period_start, current_period_end, price_snapshot)
    VALUES
      ('service_provider', p_subscriber_id, v_plan.id, 'active', NULL,
       now(), now() + make_interval(days => p_dni),
       jsonb_build_object('zrodlo', 'nadanie_admin', 'powod', p_powod))
    RETURNING * INTO v_sub;

    INSERT INTO billing_audit_log (actor_id, action, target_table, target_id, before, after)
    VALUES (p_actor, 'subskrypcja.zalozona_nadaniem', 'billing_subscriptions', v_sub.id,
            NULL,
            jsonb_build_object('linia', p_linia, 'plan', v_plan.code,
                               'dni', p_dni, 'powod', p_powod,
                               'do', v_sub.current_period_end));

    RETURN jsonb_build_object(
      'ok', true,
      'zalozono_subskrypcje', true,
      'plan', v_plan.code,
      'linia', p_linia,
      'dni', p_dni,
      'nowy_koniec', v_sub.current_period_end,
      'uwaga', 'Konto nie miało planu w tej linii — założono najtańszy płatny (' || v_plan.code || ').'
    );
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
    'nowy_koniec', v_do,
    -- Patrz nagłówek: przy subskrypcji prowadzonej przez operatora kolejne
    -- `invoice.paid` nadpisze tę datę. Mówimy o tym wprost, zamiast milczeć.
    'uwaga', CASE WHEN v_sub.provider_subscription_id IS NOT NULL
                  THEN 'Konto ma subskrypcję u operatora — przy najbliższym odnowieniu data zostanie nadpisana przez Stripe.'
                  ELSE NULL END
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_przyznaj_dni_admin(uuid, text, integer, text, uuid) TO service_role;

-- KONTROLA: funkcja nie zawiera już odmowy przy braku wiersza.
SELECT
  (SELECT count(*) FROM pg_proc
    WHERE proname = 'billing_przyznaj_dni_admin'
      AND prosrc ILIKE '%BRAK_SUBSKRYPCJI%')        AS stara_odmowa_zostala,
  (SELECT count(*) FROM pg_proc
    WHERE proname = 'billing_przyznaj_dni_admin'
      AND prosrc ILIKE '%zalozono_subskrypcje%')    AS nowa_sciezka_jest;


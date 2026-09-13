-- ═══════════════════════════════════════════════════════════════════════════
-- OKRES ROZLICZENIOWY IDZIE ZA SUBSKRYPCJĄ, NIE ZA KALENDARZEM (13.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- STAN ZASTANY, ZMIERZONY: `check_usage` i `billing_consume` liczyły zużycie
-- w oknie `date_trunc('month', now())`. Pula odnawiała się PIERWSZEGO DNIA
-- MIESIĄCA, niezależnie od tego, kiedy klient kupił i kiedy płaci.
--
-- Co to znaczyło w liczbach dla pakietu Agent AI (250 minut):
--   • zakup 20 września  → 250 minut na jedenaście dni,
--   • 1 października     → DRUGIE 250, choć klient zapłacił raz,
--   • 20 października    → odnowienie u operatora, a pula bez zmian,
--     bo dostał ją pierwszego.
-- Efektem jest 500 minut miesięcznie za abonament na 250 — a minuty płacimy
-- realnymi pieniędzmi u dostawcy rozmów.
--
-- DECYZJA WŁAŚCICIELA: nowy okres = licznik pakietowy ustawiony na wartość
-- pakietu, niewykorzystane przepadają, dokupione zostają.
--
-- JAK TO ROBIMY: kluczem wiersza zużycia przestaje być pierwszy dzień miesiąca,
-- a staje się POCZĄTEK BIEŻĄCEGO OKRESU SUBSKRYPCJI, która daje tę cechę.
-- Gdy operator przedłuża okres (`invoice.paid` przesuwa `current_period_start`),
-- klucz się zmienia, wiersza dla nowego okresu jeszcze nie ma i pula rusza od
-- zera. Reset jest SKUTKIEM odnowienia, nie osobnym krokiem, który mógłby się
-- nie wykonać albo wykonać dwa razy.
--
-- DOKUPIONE MINUTY SĄ NIETKNIĘTE: siedzą w `billing_addon_packs` z własnym
-- `amount_remaining`, poza jakimkolwiek okresem. Kolejność zużycia też zostaje
-- bez zmian — najpierw pula planu, potem paczki FIFO.
--
-- CO SIĘ STANIE PRZY WYKONANIU: klucz okresu zmienia się dla wszystkich, więc
-- każdy dostaje wiersz od zera, czyli ŚWIEŻĄ PULĘ. Nikomu niczego nie zabiera;
-- część warsztatów dostanie jedno doładowanie puli więcej, raz. To jest tańsze
-- niż podwójna pula co miesiąc, którą mamy dziś.

CREATE OR REPLACE FUNCTION public.billing_okres_rozliczeniowy(
  p_subscriber_type billing_subscriber_type,
  p_subscriber_id   uuid,
  p_feature_id      uuid
) RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Okres tej subskrypcji, która daje tę cechę. Warsztat może mieć dwie
  -- subskrypcje naraz (warsztatową i agenta) o różnych datach odnowienia —
  -- SMS-y rozliczają się wtedy w okresie planu warsztatowego, a minuty
  -- w okresie pakietu agenta. Dlatego pytamy o cechę, nie o konto.
  SELECT COALESCE(
    (
      SELECT s.current_period_start::date
      FROM public.billing_subscriptions s
      JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
      WHERE s.subscriber_type = p_subscriber_type
        AND s.subscriber_id = p_subscriber_id
        AND s.status IN ('trialing', 'active')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND pf.feature_id = p_feature_id
        AND pf.is_enabled
        AND s.current_period_start IS NOT NULL
      ORDER BY s.current_period_start DESC
      LIMIT 1
    ),
    -- Bez subskrypcji zostaje miesiąc kalendarzowy: tak liczy się zużycie
    -- komuś, kto ma same doładowania i żadnego abonamentu.
    date_trunc('month', now())::date
  );
$function$;

REVOKE ALL ON FUNCTION public.billing_okres_rozliczeniowy(billing_subscriber_type, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_okres_rozliczeniowy(billing_subscriber_type, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_usage(p_subscriber_type billing_subscriber_type, p_subscriber_id uuid, p_feature_key text, p_amount numeric DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_feature_id uuid;
  v_found      boolean := false;
  v_limit      numeric;
  v_soft       numeric;
  v_overridden boolean := false;
  v_used       numeric := 0;
  v_packs      numeric := 0;
  v_available  numeric;
  v_period     date;  -- ustawiany niżej, gdy znamy cechę
BEGIN
  SELECT id INTO v_feature_id FROM public.billing_features WHERE key = p_feature_key AND is_active;
  IF v_feature_id IS NULL THEN
    -- Nieznana cecha: paczek na nią też nie ma jak założyć, więc zero jest tu
    -- prawdą, a nie skrótem.
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'unknown_feature',
      'used', 0, 'limit', null, 'remaining', 0, 'packs_remaining', 0
    );
  END IF;

  -- OKRES ROZLICZENIOWY IDZIE ZA SUBSKRYPCJĄ, NIE ZA KALENDARZEM.
  -- Jedno źródło dla `check_usage` i `billing_consume` — inaczej „sprawdź"
  -- i „zużyj" liczyłyby z różnych okresów.
  v_period := public.billing_okres_rozliczeniowy(p_subscriber_type, p_subscriber_id, v_feature_id);

  -- ⬇️ PRZENIESIONE WYŻEJ. Wcześniej stało pod warunkiem `IF NOT v_found`,
  -- więc dla warsztatu bez subskrypcji nigdy się nie wykonywało.
  SELECT COALESCE(sum(amount_remaining), 0) INTO v_packs
  FROM public.billing_addon_packs
  WHERE subscriber_type = p_subscriber_type
    AND subscriber_id = p_subscriber_id
    AND feature_id = v_feature_id
    AND amount_remaining > 0
    AND (expires_at IS NULL OR expires_at > now());

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_active_subscriptions(p_subscriber_type, p_subscriber_id) s
    JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
    WHERE pf.feature_id = v_feature_id AND pf.is_enabled
  ) INTO v_found;

  SELECT
    CASE WHEN bool_or(lim IS NULL) THEN NULL ELSE max(lim) END,
    max(soft),
    COALESCE(bool_or(is_override), false)
  INTO v_limit, v_soft, v_overridden
  FROM (
    SELECT
      CASE WHEN sl.subscription_id IS NOT NULL THEN sl.limit_value ELSE pf.limit_value END AS lim,
      pf.soft_limit_value AS soft,
      sl.subscription_id IS NOT NULL AS is_override
    FROM public.billing_active_subscriptions(p_subscriber_type, p_subscriber_id) s
    JOIN public.billing_plan_features pf ON pf.plan_id = s.plan_id
    LEFT JOIN public.billing_subscription_limits sl
           ON sl.subscription_id = s.subscription_id AND sl.feature_id = v_feature_id
    WHERE pf.feature_id = v_feature_id AND pf.is_enabled
  ) t;

  IF NOT v_found THEN
    -- Bez planu — ale z paczkami. `limit` i `used` podajemy jako zero, żeby
    -- wyliczenie „limit - used + paczki" u wołających dawało dokładnie paczki.
    IF v_packs >= p_amount THEN
      RETURN jsonb_build_object(
        'allowed', true, 'reason', 'tylko_paczki',
        'used', 0, 'limit', 0, 'remaining', v_packs,
        'packs_remaining', v_packs
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'feature_not_in_plan',
      'used', 0, 'limit', 0, 'remaining', v_packs,
      -- Prawdziwa liczba, nawet gdy nie starcza. Zero tutaj znaczyłoby dla
      -- paska „nie masz nic", gdy klient ma np. 3 z wymaganych 5.
      'packs_remaining', v_packs
    );
  END IF;

  SELECT COALESCE(u.used, 0) INTO v_used
  FROM public.billing_usage u
  WHERE u.subscriber_type = p_subscriber_type
    AND u.subscriber_id = p_subscriber_id
    AND u.feature_id = v_feature_id
    AND u.period_start = v_period;
  v_used := COALESCE(v_used, 0);

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true, 'reason', 'unlimited',
      'used', v_used, 'limit', null, 'remaining', null,
      'packs_remaining', v_packs,
      'soft_limit', v_soft,
      'soft_exceeded', (v_soft IS NOT NULL AND v_used > v_soft),
      'overridden', v_overridden
    );
  END IF;

  v_available := GREATEST(v_limit - v_used, 0) + v_packs;

  RETURN jsonb_build_object(
    'allowed', v_available >= p_amount,
    'reason', CASE WHEN v_available >= p_amount THEN 'ok' ELSE 'limit_exceeded' END,
    'used', v_used, 'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0),
    'packs_remaining', v_packs,
    'soft_limit', v_soft,
    'soft_exceeded', (v_soft IS NOT NULL AND v_used > v_soft),
    'overridden', v_overridden
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.billing_consume(p_subscriber_type billing_subscriber_type, p_subscriber_id uuid, p_feature_key text, p_amount numeric DEFAULT 1, p_pozwol_nadwyzke boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_feature_id uuid;
  v_stan       jsonb;
  v_limit      numeric;
  v_used       numeric;
  v_period     date;  -- ustawiany niżej, gdy znamy cechę
  v_zostalo    numeric := p_amount;
  v_zPuli      numeric := 0;
  v_zPaczek    numeric := 0;
  v_nadwyzka   numeric := 0;
  v_wolne      numeric;
  v_pack       record;
  v_biore      numeric;
  v_stawka     numeric := 0;
  v_sufit      numeric;
  v_juz        numeric := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'billing_consume: liczba jednostek musi być dodatnia';
  END IF;

  SELECT id INTO v_feature_id FROM billing_features WHERE key = p_feature_key AND is_active;
  IF v_feature_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_feature');
  END IF;

  -- OKRES ROZLICZENIOWY IDZIE ZA SUBSKRYPCJĄ, NIE ZA KALENDARZEM.
  -- Jedno źródło dla `check_usage` i `billing_consume` — inaczej „sprawdź"
  -- i „zużyj" liczyłyby z różnych okresów.
  v_period := public.billing_okres_rozliczeniowy(p_subscriber_type, p_subscriber_id, v_feature_id);

  -- Blokada na wierszu zużycia. Bez niej dwa równoczesne wysłania SMS-a
  -- odczytałyby to samo `used` i oba zmieściłyby się w limicie, przekraczając
  -- go o jeden. Wiersz zakładamy od razu, żeby było co zablokować.
  INSERT INTO billing_usage (subscriber_type, subscriber_id, feature_id, period_start, used)
  VALUES (p_subscriber_type, p_subscriber_id, v_feature_id, v_period, 0)
  ON CONFLICT (subscriber_type, subscriber_id, feature_id, period_start) DO NOTHING;

  SELECT used INTO v_used FROM billing_usage
  WHERE subscriber_type = p_subscriber_type AND subscriber_id = p_subscriber_id
    AND feature_id = v_feature_id AND period_start = v_period
  FOR UPDATE;

  -- Uprawnienie i limit bierzemy z `check_usage`, żeby nie było DRUGIEJ reguły
  -- obok tamtej. Rozjazd między „sprawdź" a „zużyj" znaczyłby, że panel
  -- pokazuje co innego, niż dzieje się przy wysyłce.
  v_stan := public.check_usage(p_subscriber_type, p_subscriber_id, p_feature_key, p_amount);

  IF (v_stan ->> 'reason') = 'unknown_feature' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_feature');
  END IF;

  -- Brak planu I brak wystarczających paczek — jedyny przypadek, w którym
  -- nadal odmawiamy. Sam brak planu NIE wystarcza: paczka jest kupowana
  -- osobno i ma działać niezależnie od abonamentu.
  IF (v_stan ->> 'reason') = 'feature_not_in_plan' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feature_not_in_plan',
                              'z_puli', 0, 'z_paczek', 0, 'nadwyzka', 0);
  END IF;

  -- `tylko_paczki` przechodzi dalej: `check_usage` podaje wtedy `limit: 0`,
  -- więc pula planu wyczerpuje się od razu i wszystko schodzi z paczek tą samą
  -- drogą FIFO co zwykle. Nie ma tu osobnej gałęzi ani drugiej reguły.

  v_limit := NULLIF(v_stan ->> 'limit', '')::numeric;

  -- ── 1. Pula z planu ──────────────────────────────────────────────
  IF v_limit IS NULL THEN
    -- Bez limitu: wszystko idzie z planu, paczek nie ruszamy.
    UPDATE billing_usage SET used = used + p_amount, updated_at = now()
    WHERE subscriber_type = p_subscriber_type AND subscriber_id = p_subscriber_id
      AND feature_id = v_feature_id AND period_start = v_period;

    RETURN jsonb_build_object(
      'ok', true, 'reason', 'unlimited',
      'z_puli', p_amount, 'z_paczek', 0, 'nadwyzka', 0,
      'soft_exceeded', COALESCE((v_stan ->> 'soft_exceeded')::boolean, false));
  END IF;

  v_wolne := GREATEST(v_limit - v_used, 0);
  v_zPuli := LEAST(v_wolne, v_zostalo);
  v_zostalo := v_zostalo - v_zPuli;

  -- ── 2. Paczki, FIFO ──────────────────────────────────────────────
  -- Najpierw te, które przepadają najwcześniej: inaczej klientowi wygasłaby
  -- paczka, z której dało się jeszcze skorzystać, a zostałaby bezterminowa.
  IF v_zostalo > 0 THEN
    FOR v_pack IN
      SELECT id, amount_remaining FROM billing_addon_packs
      WHERE subscriber_type = p_subscriber_type AND subscriber_id = p_subscriber_id
        AND feature_id = v_feature_id AND amount_remaining > 0
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at ASC NULLS LAST, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_zostalo <= 0;
      v_biore := LEAST(v_pack.amount_remaining, v_zostalo);
      UPDATE billing_addon_packs
      SET amount_remaining = amount_remaining - v_biore, updated_at = now()
      WHERE id = v_pack.id;
      v_zPaczek := v_zPaczek + v_biore;
      v_zostalo := v_zostalo - v_biore;
    END LOOP;
  END IF;

  -- ── 3. Nadwyżka ──────────────────────────────────────────────────
  IF v_zostalo > 0 THEN
    IF NOT p_pozwol_nadwyzke THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'limit_exceeded',
        'brakuje', v_zostalo, 'z_puli', v_zPuli, 'z_paczek', v_zPaczek);
    END IF;

    SELECT overage_price_net INTO v_stawka
    FROM billing_features WHERE id = v_feature_id;

    IF v_stawka IS NULL THEN
      -- Nie ma stawki, więc nie ma jak tego wycenić. Wolimy odmówić niż
      -- dopisać klientowi zużycie, którego nie umiemy zafakturować.
      RETURN jsonb_build_object('ok', false, 'reason', 'brak_stawki_nadwyzki',
        'brakuje', v_zostalo, 'z_puli', v_zPuli, 'z_paczek', v_zPaczek);
    END IF;

    SELECT overage_cap_net INTO v_sufit FROM billing_settings WHERE id = true;
    v_sufit := COALESCE(v_sufit, 200);

    SELECT COALESCE(amount_net, 0) INTO v_juz FROM billing_overage
    WHERE subscriber_type = p_subscriber_type AND subscriber_id = p_subscriber_id
      AND feature_id = v_feature_id AND period_start = v_period;
    v_juz := COALESCE(v_juz, 0);

    IF v_juz + round(v_zostalo * v_stawka, 2) > v_sufit THEN
      -- Sufit chroni przed rachunkiem, którego nikt nie zapłaci: jedna pętla
      -- w kodzie klienta albo zawieszony import wygenerowałby tysiące sztuk.
      RETURN jsonb_build_object('ok', false, 'reason', 'sufit_nadwyzki',
        'brakuje', v_zostalo, 'z_puli', v_zPuli, 'z_paczek', v_zPaczek,
        'nadwyzka_juz', v_juz, 'sufit', v_sufit);
    END IF;

    v_nadwyzka := v_zostalo;
    INSERT INTO billing_overage (subscriber_type, subscriber_id, feature_id, period_start, units, amount_net)
    VALUES (p_subscriber_type, p_subscriber_id, v_feature_id, v_period,
            v_nadwyzka, round(v_nadwyzka * v_stawka, 2))
    ON CONFLICT (subscriber_type, subscriber_id, feature_id, period_start) DO UPDATE
      SET units      = billing_overage.units + EXCLUDED.units,
          amount_net = billing_overage.amount_net + EXCLUDED.amount_net,
          updated_at = now();
    v_zostalo := 0;
  END IF;

  -- Do `billing_usage` wpisujemy WSZYSTKO, co zużyto — także to z paczek
  -- i z nadwyżki. Inaczej licznik zużycia pokazywałby mniej, niż klient
  -- naprawdę wykorzystał, i nie dałoby się odpowiedzieć „ile wysłał w maju".
  UPDATE billing_usage SET used = used + p_amount, updated_at = now()
  WHERE subscriber_type = p_subscriber_type AND subscriber_id = p_subscriber_id
    AND feature_id = v_feature_id AND period_start = v_period;

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'ok',
    'z_puli', v_zPuli, 'z_paczek', v_zPaczek, 'nadwyzka', v_nadwyzka,
    'soft_exceeded', COALESCE((v_stan ->> 'soft_exceeded')::boolean, false));
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — obie funkcje muszą pytać o okres w JEDNYM miejscu.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM pg_proc
    WHERE proname IN ('check_usage', 'billing_consume')
      AND prosrc ILIKE '%billing_okres_rozliczeniowy%')                    AS funkcje_z_nowym_okresem,
  (SELECT count(*) FROM pg_proc
    WHERE proname IN ('check_usage', 'billing_consume')
      AND prosrc ILIKE '%date_trunc(''month'', now())%')                   AS funkcje_ze_starym_oknem;


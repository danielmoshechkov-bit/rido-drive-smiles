-- 🔴 Kupione paczki były niewidoczne dla warsztatu bez subskrypcji.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ DZIAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- `check_usage` sprawdzała najpierw, czy jakakolwiek aktywna subskrypcja daje
-- daną funkcję. Gdy nie — wychodziła NATYCHMIAST z `feature_not_in_plan`
-- i `packs_remaining: 0`. Zapytanie o paczki stało NIŻEJ, więc nigdy się nie
-- wykonywało.
--
-- Skutek: klient płaci za 10 sprawdzeń VIN, paczka powstaje poprawnie,
-- a system twierdzi, że kredytów nie ma. Pasek pokazuje zero, wysyłka odmawia.
-- `billing_consume` powielała ten błąd, bo bierze uprawnienie z `check_usage`
-- i też wychodziła na tym samym powodzie.
--
-- To jest błąd projektowy, nie dane. Paczka jest kupowana OSOBNO i ma działać
-- niezależnie od tego, czy warsztat ma abonament — także gdy planu nie ma
-- w ogóle, gdy wygasł, i gdy cechy nie ma w planie.
--
-- Kolejność zostaje bez zmian: pula planu → paczki → nadwyżka.
-- Zmienia się jedno: BRAK PIERWSZEGO ELEMENTU NIE ZERUJE POZOSTAŁYCH.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NOWY POWÓD: `tylko_paczki`
-- ═══════════════════════════════════════════════════════════════════════════
-- Zamiast zwracać `allowed: true` z powodem `feature_not_in_plan` — co jest
-- wewnętrznie sprzeczne i myliłoby każdego, kto to czyta — wprowadzamy osobny
-- powód. `tylko_paczki` znaczy: planu nie ma albo funkcji w nim nie ma, ale
-- klient ma kupione jednostki i wolno mu ich użyć.
--
-- `feature_not_in_plan` zostaje dla sytuacji, gdy nie ma ANI planu, ANI paczek.
-- Dzięki temu komunikat dla klienta nadal potrafi odróżnić „doładuj" od
-- „ta funkcja nie jest w twoim pakiecie".

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. check_usage — paczki liczone ZAWSZE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_usage(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid,
  p_feature_key     text,
  p_amount          numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
  v_found      boolean := false;
  v_limit      numeric;
  v_soft       numeric;
  v_overridden boolean := false;
  v_used       numeric := 0;
  v_packs      numeric := 0;
  v_available  numeric;
  v_period     date := date_trunc('month', now())::date;
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
$$;

REVOKE ALL ON FUNCTION public.check_usage(public.billing_subscriber_type, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_usage(public.billing_subscriber_type, uuid, text, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. billing_consume — zużycie z samych paczek
-- ---------------------------------------------------------------------------
-- Odmawiała na `feature_not_in_plan`, bo bierze uprawnienie z `check_usage`.
-- Teraz przepuszcza `tylko_paczki` i traktuje pulę planu jak zero — czyli
-- schodzi prosto do paczek, tą samą drogą FIFO co zwykle.
CREATE OR REPLACE FUNCTION public.billing_consume(
  p_subscriber_type public.billing_subscriber_type,
  p_subscriber_id   uuid,
  p_feature_key     text,
  p_amount          numeric DEFAULT 1,
  p_pozwol_nadwyzke boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_feature_id uuid;
  v_stan       jsonb;
  v_limit      numeric;
  v_used       numeric;
  v_period     date := date_trunc('month', now())::date;
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
$$;

REVOKE ALL ON FUNCTION public.billing_consume(public.billing_subscriber_type, uuid, text, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_consume(public.billing_subscriber_type, uuid, text, numeric, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. sms_dostepne — rozpoznaje nowy powód
-- ---------------------------------------------------------------------------
-- Radziła sobie już wcześniej, bo przy `feature_not_in_plan` sama sumowała
-- paczki. Po zmianie dostaje `tylko_paczki` z `limit: 0`, więc ogólna ścieżka
-- „limit − used + paczki" daje dokładnie paczki. Zostawiam obie gałęzie:
-- jedna liczy, druga jest siatką bezpieczeństwa.
CREATE OR REPLACE FUNCTION public.sms_dostepne(p_provider_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_stan jsonb;
  v_lim  numeric;
BEGIN
  v_stan := public.check_usage('service_provider', p_provider_id, 'sms', 1);

  IF (v_stan ->> 'reason') = 'unlimited' THEN RETURN NULL; END IF;

  IF (v_stan ->> 'reason') IN ('unknown_feature', 'feature_not_in_plan', 'tylko_paczki') THEN
    RETURN COALESCE((SELECT sum(amount_remaining) FROM billing_addon_packs p
                     JOIN billing_features f ON f.id = p.feature_id
                     WHERE p.subscriber_type = 'service_provider'
                       AND p.subscriber_id = p_provider_id AND f.key = 'sms'
                       AND p.amount_remaining > 0
                       AND (p.expires_at IS NULL OR p.expires_at > now())), 0);
  END IF;

  v_lim := NULLIF(v_stan ->> 'limit', '')::numeric;
  RETURN GREATEST(COALESCE(v_lim, 0) - COALESCE((v_stan ->> 'used')::numeric, 0), 0)
       + COALESCE((v_stan ->> 'packs_remaining')::numeric, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_dostepne(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_dostepne(uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

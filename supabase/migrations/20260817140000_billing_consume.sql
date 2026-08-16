-- 4.10 — `billing_consume`: zużycie w kolejności pula planu → paczki FIFO →
-- nadwyżka, z sufitem miesięcznym.
--
-- `check_usage` (4.9) tylko LICZY i jest `STABLE` — nic nie zapisuje. Bez
-- funkcji zapisującej limity są ozdobą: `billing_usage` zostaje puste, paczki
-- się odkładają, a nic ich nie zdejmuje.
--
-- ⚠️ TA MIGRACJA NIE PRZESTAWIA JESZCZE ŻADNEGO ZUŻYCIA. Zakłada mechanizm
-- i tabelę nadwyżki. Przełączenie SMS-ów i sprawdzeń VIN ze starych sald na
-- ten mechanizm to osobna decyzja: dotyka sald, za które ktoś zapłacił,
-- i wymaga uzgodnienia (patrz `odzwierciedlone_at` w `billing_addon_packs`).

-- ---------------------------------------------------------------------------
-- 1. Nadwyżka
-- ---------------------------------------------------------------------------
-- Zużycie ponad limit i ponad paczki. Rejestrujemy je osobno, bo to jedyna
-- pozycja, która powstaje BEZ wcześniejszej zapłaty — klient dowie się o niej
-- z faktury, więc musi dać się co do sztuki odtworzyć.
CREATE TABLE IF NOT EXISTS public.billing_overage (
  subscriber_type public.billing_subscriber_type NOT NULL,
  subscriber_id   uuid NOT NULL,
  feature_id      uuid NOT NULL REFERENCES public.billing_features(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  units           numeric(12,2) NOT NULL DEFAULT 0 CHECK (units >= 0),
  amount_net      numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount_net >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_type, subscriber_id, feature_id, period_start)
);

ALTER TABLE public.billing_overage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_overage FROM anon, authenticated;

COMMENT ON TABLE public.billing_overage IS
  'Zużycie ponad limit i ponad wykupione paczki, rozliczane po fakcie. '
  'Sufit miesięczny w billing_settings.overage_cap_net.';

-- Stawka nadwyżki należy do FUNKCJI, nie do produktu sprzedażowego.
--
-- Pierwsza wersja brała ją z `billing_addon_products` przez „pierwszy produkt
-- dla tej funkcji wg sort_order". Przy DWÓCH produktach na jedną funkcję
-- (np. promocja obok stawki podstawowej) wybierało to niewłaściwy, po cichu —
-- test pokazał nadwyżkę 0,70 zł tam, gdzie miało być 14,00, i sufit, który
-- przez to nie zadziałał. Cena rozliczenia nie może zależeć od kolejności
-- wierszy w katalogu sprzedaży.
ALTER TABLE public.billing_features
  ADD COLUMN IF NOT EXISTS overage_price_net numeric(10,4)
    CHECK (overage_price_net IS NULL OR overage_price_net > 0);

COMMENT ON COLUMN public.billing_features.overage_price_net IS
  'Stawka netto za jednostkę zużytą PONAD limit i ponad paczki. NULL = nie '
  'rozliczamy nadwyżki tej funkcji i zużycie ponad limit jest odrzucane.';

UPDATE public.billing_features SET overage_price_net = 0.20 WHERE key = 'sms';
UPDATE public.billing_features SET overage_price_net = 1.70 WHERE key = 'vehicle_lookup';

-- Sufit nadwyżki: ile najwyżej wolno dopisać klientowi w miesiącu, zanim
-- odmówimy. Bez niego jedna pętla w kodzie klienta albo zawieszony import
-- potrafiłby wygenerować rachunek, którego nikt nie zapłaci.
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS overage_cap_net numeric(10,2) NOT NULL DEFAULT 200
    CHECK (overage_cap_net >= 0);

-- ---------------------------------------------------------------------------
-- 2. Zużycie
-- ---------------------------------------------------------------------------
-- Zwraca jsonb z tym, co się wydarzyło — wołający musi wiedzieć, czy operacja
-- przeszła i z czego została opłacona.
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

  IF (v_stan ->> 'reason') IN ('unknown_feature', 'feature_not_in_plan') THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_stan ->> 'reason');
  END IF;

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

REVOKE ALL ON FUNCTION public.billing_consume(public.billing_subscriber_type, uuid, text, numeric, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.billing_consume(public.billing_subscriber_type, uuid, text, numeric, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

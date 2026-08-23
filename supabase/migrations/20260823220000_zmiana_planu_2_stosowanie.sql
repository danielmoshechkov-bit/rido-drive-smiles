-- Zmiana planu (2/3): odłożona zmiana wchodzi w życie na ścieżce BLIK-owej.
--
-- ⚠️ URUCHAMIAĆ PO `20260823210000_zmiana_planu_1_baza.sql`.
--
-- Obie funkcje przenoszę Z PRODUKCJI i dokładam jedną rzecz każdej. Przepisanie
-- ich z pamięci zgubiło mi już raz warunek `status <> 'oplacone'` w innej
-- funkcji — czyli sam otworzyłbym dziurę wydającą towar za niezapłacone.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZAKUP UNIEWAŻNIA ODŁOŻONĄ ZMIANĘ, ODNOWIENIE JĄ STOSUJE
-- ═══════════════════════════════════════════════════════════════════════════
-- To nie jest niespójność, tylko dwie różne sytuacje:
--
--   • klient KUPUJE okres — właśnie wybrał plan, świadomie i z cennikiem przed
--     oczami. Zejście zgłoszone tydzień wcześniej jest nieaktualne. Gdybyśmy
--     je zastosowali, klient zapłaciłby za Pro i dostał Standard.
--
--   • okres MIJA bez zakupu — nikt niczego nie wybierał, więc obowiązuje
--     ostatnia decyzja klienta, czyli odłożona zmiana.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Wydanie okresu: zakup unieważnia odłożoną zmianę
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_wydaj_okres(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_zam      billing_orders%ROWTYPE;
  v_sub      billing_subscriptions%ROWTYPE;
  v_od       timestamptz;
  v_do       timestamptz;
  v_miesiecy integer;
  v_sub_id   uuid;
BEGIN
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;

  IF v_zam.id IS NULL THEN
    RAISE EXCEPTION 'billing_wydaj_okres: nie ma zamówienia %', p_order_id;
  END IF;
  IF v_zam.plan_id IS NULL THEN
    RAISE EXCEPTION 'billing_wydaj_okres: zamówienie % nie dotyczy planu', p_order_id;
  END IF;
  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_okres: zamówienie % ma status %', p_order_id, v_zam.status;
  END IF;
  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN NULL;   -- powtórzone powiadomienie
  END IF;

  -- ILE MIESIĘCY — z zamrożonego zamówienia, nie z bieżącego cennika.
  -- Klient kupił konkretny okres i tyle ma dostać, choćby rabat zmienił się
  -- w międzyczasie. Brak wartości = miesiąc: tak wyglądały zamówienia sprzed
  -- wprowadzenia roku i mają zostać obsłużone poprawnie.
  v_miesiecy := GREATEST(COALESCE((v_zam.snapshot ->> 'miesiecy')::integer, 1), 1);

  -- FOR UPDATE także tutaj: bez tego zadanie o 3:05 mogłoby zastosować odłożone
  -- zejście dokładnie między naszym odczytem a zapisem, a klient zapłaciłby
  -- za Pro i dostał Standard.
  SELECT * INTO v_sub FROM billing_subscriptions
  WHERE subscriber_type = v_zam.subscriber_type::billing_subscriber_type
    AND subscriber_id   = v_zam.subscriber_id
    AND product_line    = 'warsztat'
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  v_sub_id := v_sub.id;

  v_od := now();
  -- Późniejsza z dwóch: koniec bieżącego okresu albo teraz. Klient płacący
  -- miesięcznie, który kupuje rok w połowie okresu, DOLICZA rok do tego, co ma —
  -- nie traci opłaconych dni.
  v_do := GREATEST(COALESCE(v_sub.current_period_end, now()), now())
          + make_interval(months => v_miesiecy);

  IF v_sub_id IS NULL THEN
    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status, provider,
       current_period_start, current_period_end, price_guarantee_until, price_snapshot)
    VALUES
      (v_zam.subscriber_type, v_zam.subscriber_id, v_zam.plan_id, 'active', 'payu',
       v_od, v_do, now() + interval '12 months', v_zam.snapshot)
    RETURNING id INTO v_sub_id;
  ELSE
    UPDATE billing_subscriptions
    SET plan_id               = v_zam.plan_id,
        -- `status` MUSI być w tym zapisie, nawet gdy już jest `active`:
        -- wyzwalacz `billing_znacznik_karencji` reaguje na UPDATE OF status
        -- i to on czyści tryb dokończenia.
        status                = 'active',
        provider              = 'payu',
        current_period_start  = v_od,
        current_period_end    = v_do,
        price_guarantee_until = COALESCE(price_guarantee_until, now() + interval '12 months'),
        price_snapshot        = v_zam.snapshot,
        -- ZAKUP UNIEWAŻNIA ODŁOŻONĄ ZMIANĘ. Klient właśnie wybrał plan przy
        -- cenniku; decyzja sprzed tygodnia jest nieaktualna. Zostawienie jej
        -- znaczyłoby, że opłacony Pro zjeżdża do Standardu przy odnowieniu,
        -- choć klient nigdy o to nie prosił.
        plan_od_nastepnego_okresu = NULL,
        plan_zmiana_zgloszona_at  = NULL,
        updated_at            = now()
    WHERE id = v_sub_id;
  END IF;

  UPDATE billing_orders SET wydane_at = now(), updated_at = now() WHERE id = p_order_id;
  RETURN v_sub_id;
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_wydaj_okres(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_okres(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Koniec opłaconego miesiąca: odłożona zmiana wchodzi w życie
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_konczy_sie_miesiac()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_ile   integer;
  v_zmian integer;
BEGIN
  UPDATE billing_subscriptions s
  SET dokanczanie_do    = public.termin_dokonczenia(s.subscriber_id),
      dokanczanie_powod = 'platnosc',
      updated_at        = now()
  WHERE s.status = 'active'
    AND s.provider = 'payu'
    AND s.subscriber_type = 'service_provider'
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end < now()
    AND s.dokanczanie_do IS NULL;

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_konczy_sie_miesiac: % warsztatów po opłaconym miesiącu', v_ile;
  END IF;

  -- ODŁOŻONA ZMIANA PLANU. Osobny zapis, nie doklejony do powyższego, bo
  -- dotyczy INNEGO zbioru wierszy: zmiana ma wejść także tam, gdzie tryb
  -- dokończenia został ustawiony wcześniejszym przebiegiem. Sklejenie tego
  -- w jeden UPDATE znaczyłoby, że zmiana wchodzi wyłącznie pierwszej nocy,
  -- a przy każdej następnej cicho przepada.
  --
  -- Świadomie NIE dotykamy `status`: to by uruchomiło `billing_znacznik_karencji`,
  -- który przy statusie `active` kasuje właśnie ustawiony tryb dokończenia.
  UPDATE billing_subscriptions s
  SET plan_id                   = s.plan_od_nastepnego_okresu,
      plan_od_nastepnego_okresu = NULL,
      plan_zmiana_zgloszona_at  = NULL,
      updated_at                = now()
  WHERE s.provider = 'payu'
    AND s.subscriber_type = 'service_provider'
    AND s.plan_od_nastepnego_okresu IS NOT NULL
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end < now();

  GET DIAGNOSTICS v_zmian = ROW_COUNT;
  IF v_zmian > 0 THEN
    RAISE NOTICE 'billing_konczy_sie_miesiac: % odłożonych zmian planu weszło w życie', v_zmian;
  END IF;

  RETURN v_ile;
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_konczy_sie_miesiac() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_konczy_sie_miesiac() TO service_role;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $KONTROLA$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'billing_wydaj_okres';

  -- Warunki, których nie wolno zgubić przy przenoszeniu ciała funkcji.
  IF v_src NOT LIKE '%status <> ''oplacone''%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres przestała sprawdzać, czy zamówienie jest opłacone';
  END IF;
  IF v_src NOT LIKE '%wydane_at IS NOT NULL%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres przestała być idempotentna';
  END IF;
  IF v_src NOT LIKE '%plan_od_nastepnego_okresu = NULL%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres nie unieważnia odłożonej zmiany';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'billing_konczy_sie_miesiac';
  IF v_src NOT LIKE '%plan_od_nastepnego_okresu IS NOT NULL%' THEN
    RAISE EXCEPTION 'billing_konczy_sie_miesiac nie stosuje odłożonej zmiany';
  END IF;

  RAISE NOTICE 'Zakup unieważnia odłożoną zmianę, koniec okresu ją stosuje.';
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';

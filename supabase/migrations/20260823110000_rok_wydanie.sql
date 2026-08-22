-- Rok jako okres zakupu: wydanie i wygaśnięcie liczone w miesiącach.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ ZMIENIA
-- ═══════════════════════════════════════════════════════════════════════════
-- `billing_wydaj_miesiac` przedłużała okres dokładnie o miesiąc — nazwa mówiła
-- prawdę, dopóki miesiąc był jedynym okresem. Rok to ten sam mechanizm z inną
-- liczbą, więc funkcja dostaje uczciwą nazwę `billing_wydaj_okres`, a liczbę
-- miesięcy bierze Z ZAMÓWIENIA, nie z własnej nazwy.
--
-- Stara nazwa zostaje jako nakładka. Woła ją wdrożony webhook, a między
-- wykonaniem migracji a wdrożeniem funkcji brzegowej jest okno kilku minut,
-- w którym płatność mogłaby przyjść i nie mieć czego wywołać.

BEGIN;

CREATE OR REPLACE FUNCTION public.billing_wydaj_okres(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam      billing_orders%ROWTYPE;
  v_sub      billing_subscriptions%ROWTYPE;
  v_od       timestamptz;
  v_do       timestamptz;
  v_miesiecy integer;
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

  SELECT * INTO v_sub FROM billing_subscriptions
  WHERE subscriber_type = v_zam.subscriber_type
    AND subscriber_id   = v_zam.subscriber_id
    AND product_line    = 'warsztat'
  ORDER BY created_at DESC LIMIT 1;

  v_od := now();
  -- Późniejsza z dwóch: koniec bieżącego okresu albo teraz. Klient płacący
  -- miesięcznie, który kupuje rok w połowie okresu, DOLICZA rok do tego, co ma —
  -- nie traci opłaconych dni.
  v_do := GREATEST(COALESCE(v_sub.current_period_end, now()), now())
          + make_interval(months => v_miesiecy);

  IF v_sub.id IS NULL THEN
    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status, provider,
       current_period_start, current_period_end, price_guarantee_until, price_snapshot)
    VALUES
      (v_zam.subscriber_type, v_zam.subscriber_id, v_zam.plan_id, 'active', 'payu',
       v_od, v_do, now() + interval '12 months', v_zam.snapshot)
    RETURNING id INTO v_sub.id;
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
        updated_at            = now()
    WHERE id = v_sub.id;
  END IF;

  UPDATE billing_orders SET wydane_at = now(), updated_at = now() WHERE id = p_order_id;
  RETURN v_sub.id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_wydaj_okres(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_okres(uuid) TO service_role;

-- Nakładka pod wdrożoną wersją webhooka. Do usunięcia, gdy przestanie być wołana.
CREATE OR REPLACE FUNCTION public.billing_wydaj_miesiac(p_order_id uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.billing_wydaj_okres(p_order_id) $$;

REVOKE ALL ON FUNCTION public.billing_wydaj_miesiac(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_miesiac(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
-- ŚWIADOMIE BEZ ZAPISU DANYCH PRÓBNYCH. Pierwsza wersja tego bloku zakładała
-- zamówienie i wydawała je „na próbę", licząc na wycofanie przez wyjątek.
-- Działa, ale wykonuje się NA PRODUKCJI i rusza subskrypcję prawdziwego
-- warsztatu — a wystarczy jeden błąd w rozumowaniu o podtransakcjach, żeby
-- zmiana została. Zachowanie sprawdzone lokalnie, tutaj tylko to, co da się
-- stwierdzić bez pisania.
DO $$
DECLARE v_zrodlo text;
BEGIN
  IF to_regprocedure('public.billing_wydaj_okres(uuid)') IS NULL THEN
    RAISE EXCEPTION 'brak billing_wydaj_okres';
  END IF;

  -- Liczba miesięcy MUSI pochodzić z zamówienia, nie być zaszyta.
  SELECT prosrc INTO v_zrodlo FROM pg_proc WHERE proname = 'billing_wydaj_okres';
  IF v_zrodlo NOT LIKE '%snapshot ->> ''miesiecy''%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres nie czyta liczby miesięcy z zamówienia';
  END IF;
  IF v_zrodlo NOT LIKE '%make_interval(months => v_miesiecy)%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres nadal przedłuża o stałą liczbę miesięcy';
  END IF;

  -- Nakładka ma DELEGOWAĆ, a nie być drugą kopią logiki.
  SELECT prosrc INTO v_zrodlo FROM pg_proc WHERE proname = 'billing_wydaj_miesiac';
  IF v_zrodlo NOT LIKE '%billing_wydaj_okres%' THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac nie deleguje — dwie kopie logiki wydania';
  END IF;

  RAISE NOTICE 'Wydanie okresu: liczba miesięcy z zamówienia, nakładka deleguje.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

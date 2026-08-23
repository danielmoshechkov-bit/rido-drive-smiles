-- Miesiąc planu przez BLIK — krok 2: wydanie i wygaśnięcie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZNACZY „WYDANIE" PRZY MIESIĄCU
-- ═══════════════════════════════════════════════════════════════════════════
-- Przy doładowaniu wydanie zakłada paczkę. Przy miesiącu planu — przedłuża
-- OKRES DOSTĘPU: subskrypcja przechodzi na `active` z terminem o miesiąc dalej.
--
-- Odnowienie liczymy od PÓŹNIEJSZEJ z dwóch dat: końca bieżącego okresu albo
-- teraz. Klient, który zapłaci na trzy dni przed końcem, nie traci tych trzech
-- dni — a ten, który wraca po miesiącu przerwy, nie dostaje ich wstecz.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IDEMPOTENCJA
-- ═══════════════════════════════════════════════════════════════════════════
-- Ta sama zasada co przy paczkach: blokada wiersza `FOR UPDATE` i znacznik
-- `wydane_at`. Powtórzone powiadomienie od operatora nie przedłuży miesiąca
-- drugi raz. To NIE jest teoretyczne — PayU ponawia powiadomienia.

BEGIN;

CREATE OR REPLACE FUNCTION public.billing_wydaj_miesiac(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_sub    billing_subscriptions%ROWTYPE;
  v_od     timestamptz;
  v_do     timestamptz;
BEGIN
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;

  IF v_zam.id IS NULL THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac: nie ma zamówienia %', p_order_id;
  END IF;
  IF v_zam.plan_id IS NULL THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac: zamówienie % nie dotyczy planu', p_order_id;
  END IF;
  -- Wydajemy WYŁĄCZNIE za opłacone. Bez tego wystarczyłoby wywołać funkcję
  -- na zamówieniu ze statusem `nowe`.
  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_miesiac: zamówienie % ma status %', p_order_id, v_zam.status;
  END IF;
  -- Powtórzone powiadomienie: nic nie robimy i mówimy to spokojnie.
  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_sub FROM billing_subscriptions
  WHERE subscriber_type = v_zam.subscriber_type
    AND subscriber_id   = v_zam.subscriber_id
    AND product_line    = 'warsztat'
  ORDER BY created_at DESC LIMIT 1;

  v_od := now();
  -- Późniejsza z dwóch: koniec bieżącego okresu albo teraz.
  v_do := GREATEST(COALESCE(v_sub.current_period_end, now()), now()) + interval '1 month';

  IF v_sub.id IS NULL THEN
    INSERT INTO billing_subscriptions
      (subscriber_type, subscriber_id, plan_id, status, provider,
       current_period_start, current_period_end, price_guarantee_until, price_snapshot)
    VALUES
      (v_zam.subscriber_type, v_zam.subscriber_id, v_zam.plan_id, 'active', 'payu',
       v_od, v_do,
       -- Gwarancja ceny startowej biegnie od PIERWSZEGO zakupu tego klienta,
       -- nie od daty kampanii. Przy kolejnych miesiącach jej nie przesuwamy.
       now() + interval '12 months',
       v_zam.snapshot)
    RETURNING id INTO v_sub.id;
  ELSE
    UPDATE billing_subscriptions
    SET plan_id              = v_zam.plan_id,
        -- `status` MUSI być w tym zapisie, nawet gdy już jest `active`:
        -- wyzwalacz `billing_znacznik_karencji` reaguje na UPDATE OF status
        -- i to on czyści tryb dokończenia. Pominięcie tej kolumny zostawiłoby
        -- opłaconego klienta z paskiem „zostały 3 dni".
        status               = 'active',
        provider             = 'payu',
        current_period_start = v_od,
        current_period_end   = v_do,
        price_guarantee_until = COALESCE(price_guarantee_until, now() + interval '12 months'),
        price_snapshot       = v_zam.snapshot,
        updated_at           = now()
    WHERE id = v_sub.id;
  END IF;

  UPDATE billing_orders
  SET wydane_at = now(), updated_at = now()
  WHERE id = p_order_id;

  RETURN v_sub.id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_wydaj_miesiac(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_miesiac(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Wygaśnięcie miesiąca
-- ---------------------------------------------------------------------------
-- Bez tego klient płaci RAZ i korzysta bez końca — a miesiąc jednorazowy ma się
-- kończyć. Subskrypcje ze Stripe zostają nietknięte: tam okres przedłuża webhook,
-- a wygaszanie po dacie odcięłoby płacącego przy spóźnionym powiadomieniu.
-- Stąd warunek po `provider = 'payu'`.
--
-- Wygasły miesiąc NIE blokuje od razu — wprowadza w tryb dokończenia, tak samo
-- jak koniec okresu próbnego i nieudana płatność. Jedna reguła, trzy powody.
CREATE OR REPLACE FUNCTION public.billing_konczy_sie_miesiac()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ile integer;
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
  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_konczy_sie_miesiac() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_konczy_sie_miesiac() TO service_role;

-- Razem z końcem okresu próbnego, o 3:00 — jedna reguła, jedna pora.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('billing-koniec-miesiaca')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-koniec-miesiaca');
    PERFORM cron.schedule('billing-koniec-miesiaca', '5 3 * * *',
      $cron$ SELECT public.billing_konczy_sie_miesiac(); $cron$);
    RAISE NOTICE 'zadanie billing-koniec-miesiaca: 3:05 UTC';
  ELSE
    RAISE WARNING 'pg_cron niedostępny — billing_konczy_sie_miesiac trzeba wołać z zewnątrz';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

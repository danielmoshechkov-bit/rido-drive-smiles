-- 🔴 Płacący klient dostawał ostrzeżenie „kończy Ci się dostęp" W ŚRODKU
--    opłaconego okresu — i nie dostawał go przed prawdziwym końcem.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ DZIAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- `billing_do_ostrzezenia` liczy termin jako
-- `COALESCE(trial_ends_at, current_period_end)` — czyli data próbna MA
-- PIERWSZEŃSTWO. A `trial_ends_at` ustawia się przy rejestracji i NIC go nie
-- czyściło przy zapłacie.
--
-- Sprawdzone zachowaniem na koncie próbnym: po wydaniu opłaconego okresu
-- `trial_ends_at` zostawał na 22 września, a `current_period_end` szedł na
-- 22 października. Zadanie patrzyło na wrzesień.
--
-- Skutki, oba złe:
--   • 15 września klient, który ZAPŁACIŁ do 22 października, dostaje mail
--     „za 7 dni kończy się Twój dostęp". To gorsze niż brak ostrzeżenia —
--     płacący klient dowiaduje się, że zaraz straci to, za co zapłacił,
--     i pisze do nas albo płaci drugi raz.
--   • przed prawdziwym końcem okresu ostrzeżenie NIE przychodzi, bo data
--     próbna dawno minęła i nigdy nie zrówna się z „dziś + próg".
--
-- Zasięg: KAŻDY klient przechodzący z okresu próbnego na płatny. Dziś zero
-- wierszy, bo wszystkie opłacone subskrypcje mają `trial_ends_at` puste —
-- ale wiersz z datą próbną zakłada teraz każda rejestracja.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DWIE NAPRAWY, BO JEDNA NIE WYSTARCZA
-- ═══════════════════════════════════════════════════════════════════════════
--  1. ODCZYT: dla subskrypcji, która NIE jest próbna, liczy się koniec okresu.
--     To zamyka sprawę niezależnie od tego, czy ktoś kiedyś zapomni wyczyścić
--     datę — także na ścieżce kartowej, gdzie wiersz aktualizuje webhook.
--  2. ZAPIS: `billing_wydaj_okres` czyści datę próbną przy wydaniu opłaconego
--     okresu. Zostawianie w bazie daty, która już nic nie znaczy, to zaproszenie
--     dla następnej funkcji, żeby znów po nią sięgnęła.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Odczyt: data próbna liczy się tylko w okresie próbnym
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_do_ostrzezenia()
RETURNS TABLE (
  subscription_id uuid,
  provider_id     uuid,
  user_id         uuid,
  email           text,
  nazwa_firmy     text,
  prog_dni        integer,
  koniec          date,
  powod           text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
  WITH kandydaci AS (
    SELECT s.id, s.subscriber_id, s.status,
           -- Data próbna WYŁĄCZNIE dla subskrypcji próbnej. Dla opłaconej
           -- liczy się koniec okresu — nawet gdyby stara data próbna została
           -- w wierszu.
           CASE WHEN s.status = 'trialing'
                THEN COALESCE(s.trial_ends_at, s.current_period_end)
                ELSE s.current_period_end
           END::date AS koniec,
           CASE WHEN s.status = 'trialing' THEN 'trial' ELSE 'platnosc' END AS powod
    FROM billing_subscriptions s
    WHERE s.subscriber_type = 'service_provider'
      AND s.status IN ('trialing', 'active')
      AND s.product_line = 'warsztat'
      AND s.cancel_at IS NULL
      AND (CASE WHEN s.status = 'trialing'
                THEN COALESCE(s.trial_ends_at, s.current_period_end)
                ELSE s.current_period_end END) IS NOT NULL
  ),
  z AS (
    SELECT k.id, k.subscriber_id, k.koniec, k.powod, p.prog
    FROM kandydaci k
    CROSS JOIN (VALUES (7), (1)) AS p(prog)
    WHERE k.koniec = (now() AT TIME ZONE 'Europe/Warsaw')::date + p.prog
  )
  SELECT z.id, z.subscriber_id, sp.user_id,
         COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email),
         COALESCE(NULLIF(sp.company_name, ''), 'Twój warsztat'),
         z.prog, z.koniec, z.powod
  FROM z
  JOIN service_providers sp ON sp.id = z.subscriber_id
  JOIN auth.users u ON u.id = sp.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM billing_ostrzezenia o
    WHERE o.subscription_id = z.id AND o.prog_dni = z.prog AND o.dotyczy_daty = z.koniec
  )
  AND COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email) IS NOT NULL;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_do_ostrzezenia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_do_ostrzezenia() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Zapis: opłacenie kasuje datę próbną
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

  v_miesiecy := GREATEST(COALESCE((v_zam.snapshot ->> 'miesiecy')::integer, 1), 1);

  SELECT * INTO v_sub FROM billing_subscriptions
  WHERE subscriber_type = v_zam.subscriber_type::billing_subscriber_type
    AND subscriber_id   = v_zam.subscriber_id
    AND product_line    = 'warsztat'
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  v_sub_id := v_sub.id;

  v_od := now();
  -- DOKLEJANIE: późniejsza z dwóch dat. Klient kupuje OKRES, nie abonament od
  -- stałej daty — kupując rok w połowie miesiąca dostaje rok DO tego, co ma.
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
        -- DATA PRÓBNA PRZESTAJE OBOWIĄZYWAĆ. Zostawiona w wierszu znaczyła,
        -- że ostrzeżenie leci w środku opłaconego okresu, a przed prawdziwym
        -- końcem nie leci wcale.
        trial_ends_at         = NULL,
        price_guarantee_until = COALESCE(price_guarantee_until, now() + interval '12 months'),
        price_snapshot        = v_zam.snapshot,
        -- ZAKUP UNIEWAŻNIA ODŁOŻONĄ ZMIANĘ — klient właśnie wybrał plan.
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
-- 3. Wyrównanie wstecz
-- ---------------------------------------------------------------------------
-- Dziś takich wierszy nie ma, ale kosztuje to jeden UPDATE, a zostawienie
-- daty próbnej na opłaconej subskrypcji jest po prostu nieprawdą w bazie.
-- Bez dotykania `status`, żeby nie budzić wyzwalacza karencji.
UPDATE billing_subscriptions
SET trial_ends_at = NULL, updated_at = now()
WHERE status IN ('active', 'past_due') AND trial_ends_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $KONTROLA$
DECLARE v_src text; v_zostalo int;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'billing_wydaj_okres';
  IF v_src NOT LIKE '%trial_ends_at         = NULL%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres nie czyści daty próbnej';
  END IF;
  IF v_src NOT LIKE '%status <> ''oplacone''%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres przestała sprawdzać opłacenie zamówienia';
  END IF;
  IF v_src NOT LIKE '%wydane_at IS NOT NULL%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres przestała być idempotentna';
  END IF;
  IF v_src NOT LIKE '%plan_od_nastepnego_okresu = NULL%' THEN
    RAISE EXCEPTION 'billing_wydaj_okres nie unieważnia odłożonej zmiany';
  END IF;

  SELECT count(*) INTO v_zostalo FROM billing_subscriptions
   WHERE status IN ('active', 'past_due') AND trial_ends_at IS NOT NULL;
  IF v_zostalo > 0 THEN
    RAISE EXCEPTION 'Zostało % opłaconych subskrypcji z datą próbną', v_zostalo;
  END IF;

  RAISE NOTICE 'Ostrzeżenia liczą się z końca opłaconego okresu, data próbna znika przy zapłacie.';
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';

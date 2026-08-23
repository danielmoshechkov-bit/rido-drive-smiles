-- Zmiana planu (1/3): warstwa bazy — odłożona zmiana i jej stosowanie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZASADA
-- ═══════════════════════════════════════════════════════════════════════════
-- W GÓRĘ OD RAZU: klient płaci różnicę i dostaje wyższy plan natychmiast.
-- W DÓŁ OD NASTĘPNEGO OKRESU: klient ma opłacony wyższy plan do końca okresu
-- i nie odbieramy mu tego, za co zapłacił. Niższa cena wchodzi przy odnowieniu.
--
-- Ta migracja NIE dotyka Stripe'a ani interfejsu. Zakłada miejsce na odłożoną
-- zmianę i trzy funkcje, które nią operują. Podmiana pozycji u operatora
-- i okno zakupu idą osobno (2/3 i 3/3).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- GDZIE ODŁOŻONA ZMIANA JEST STOSOWANA — TRZY MIEJSCA, NIE JEDNO
-- ═══════════════════════════════════════════════════════════════════════════
--  1. `billing_wydaj_okres` — klient KUPUJE kolejny okres (BLIK). Zakup jest
--     świadomym wyborem planu, więc UNIEWAŻNIA odłożoną zmianę zamiast ją
--     stosować. Klient, który zgłosił zejście na Standard, a potem kupił Pro,
--     chce Pro — nie zejścia zaplanowanego tydzień wcześniej.
--  2. `billing_konczy_sie_miesiac` — okres BLIK-owy mija BEZ zakupu. Wtedy
--     odłożona zmiana wchodzi w życie: dostęp i tak się kończy, a plan ma
--     odpowiadać temu, co klient wybrał.
--  3. `billing_zastosuj_odlozona_zmiane` — wołana z webhooka Stripe przy
--     odnowieniu. Tam pozycja u operatora jest już podmieniona (2/3), więc
--     baza musi tylko dogonić stan opłacony.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO `FOR UPDATE` WSZĘDZIE
-- ═══════════════════════════════════════════════════════════════════════════
-- Zadanie odnowieniowe chodzi o 3:05. Klient może wycofać zmianę o 3:05:00.
-- Bez blokady wiersza wycofanie i zastosowanie czytają ten sam stan i jedno
-- nadpisuje drugie: klient widzi „wycofano", a plan i tak zjechał w dół.
-- Blokada ustawia je w kolejkę, więc drugie widzi wynik pierwszego.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Miejsce na odłożoną zmianę
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS plan_od_nastepnego_okresu uuid
    REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS plan_zmiana_zgloszona_at timestamptz;

COMMENT ON COLUMN public.billing_subscriptions.plan_od_nastepnego_okresu IS
  'Plan, który wejdzie w życie przy najbliższym odnowieniu. Puste = brak odłożonej zmiany. Dostęp liczy się z plan_id, nie stąd.';
COMMENT ON COLUMN public.billing_subscriptions.plan_zmiana_zgloszona_at IS
  'Kiedy klient zgłosił odłożoną zmianę — do pokazania w panelu i do sporów.';

-- ON DELETE RESTRICT, nie SET NULL: zniknięcie planu z cennika nie ma po cichu
-- kasować zgłoszonej zmiany. Klient zobaczyłby, że zejście „nie zadziałało",
-- i nie dowiedziałby się dlaczego.

-- ---------------------------------------------------------------------------
-- 2. Zgłoszenie odłożonej zmiany
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_zaplanuj_zmiane_planu(
  p_sub_id  uuid,
  p_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_sub  billing_subscriptions%ROWTYPE;
  v_plan billing_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = p_sub_id FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'billing_zaplanuj_zmiane_planu: nie ma subskrypcji %', p_sub_id;
  END IF;

  SELECT * INTO v_plan FROM billing_plans WHERE id = p_plan_id;
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'billing_zaplanuj_zmiane_planu: nie ma planu %', p_plan_id;
  END IF;

  -- Fail-closed: plan wycofany albo wyceniany indywidualnie nie wchodzi
  -- odłożoną zmianą. Inaczej za miesiąc klient wylądowałby na planie,
  -- którego nie da się kupić ani wycenić.
  IF NOT v_plan.is_active OR v_plan.is_custom THEN
    RAISE EXCEPTION 'ZMIANA_ODRZUCONA: plan % nie jest dostępny do samodzielnego wyboru', v_plan.code;
  END IF;

  IF v_plan.product_line <> v_sub.product_line THEN
    RAISE EXCEPTION 'ZMIANA_ODRZUCONA: plan % jest z innej linii produktowej', v_plan.code;
  END IF;

  -- Zgłoszenie planu, który już mamy, znaczy „nic nie zmieniaj" — i tak
  -- właśnie to robimy: kasujemy odłożoną zmianę. To jest też droga wyjścia
  -- dla klienta, który rozmyślił się i klika swój obecny plan.
  IF p_plan_id = v_sub.plan_id THEN
    UPDATE billing_subscriptions
    SET plan_od_nastepnego_okresu = NULL,
        plan_zmiana_zgloszona_at  = NULL,
        updated_at = now()
    WHERE id = p_sub_id;
    RETURN jsonb_build_object('ok', true, 'stan', 'wycofana', 'plan', v_plan.code);
  END IF;

  UPDATE billing_subscriptions
  SET plan_od_nastepnego_okresu = p_plan_id,
      plan_zmiana_zgloszona_at  = now(),
      updated_at = now()
  WHERE id = p_sub_id;

  RETURN jsonb_build_object(
    'ok', true, 'stan', 'zaplanowana', 'plan', v_plan.code,
    'obowiazuje_od', v_sub.current_period_end
  );
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_zaplanuj_zmiane_planu(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_zaplanuj_zmiane_planu(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Wycofanie — ma działać do ostatniej chwili
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_wycofaj_zmiane_planu(p_sub_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_sub billing_subscriptions%ROWTYPE;
BEGIN
  -- Blokada, nie odczyt. Jeśli zadanie odnowieniowe właśnie stosuje zmianę,
  -- czekamy na jego wynik i odpowiadamy prawdę, zamiast kasować kolumnę,
  -- która już zdążyła zadziałać.
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = p_sub_id FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'billing_wycofaj_zmiane_planu: nie ma subskrypcji %', p_sub_id;
  END IF;

  IF v_sub.plan_od_nastepnego_okresu IS NULL THEN
    -- Nie błąd. Klient kliknął „wycofaj" sekundę po tym, jak zmiana weszła
    -- w życie — i ma się o tym dowiedzieć wprost, a nie zobaczyć „gotowe".
    RETURN jsonb_build_object('ok', false, 'stan', 'nie_ma_czego_wycofac');
  END IF;

  UPDATE billing_subscriptions
  SET plan_od_nastepnego_okresu = NULL,
      plan_zmiana_zgloszona_at  = NULL,
      updated_at = now()
  WHERE id = p_sub_id;

  RETURN jsonb_build_object('ok', true, 'stan', 'wycofana');
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_wycofaj_zmiane_planu(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wycofaj_zmiane_planu(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Zastosowanie — dla ścieżki Stripe'a
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_zastosuj_odlozona_zmiane(p_sub_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_sub  billing_subscriptions%ROWTYPE;
  v_kod  text;
BEGIN
  SELECT * INTO v_sub FROM billing_subscriptions WHERE id = p_sub_id FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'billing_zastosuj_odlozona_zmiane: nie ma subskrypcji %', p_sub_id;
  END IF;

  IF v_sub.plan_od_nastepnego_okresu IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'stan', 'nie_bylo_zmiany');
  END IF;

  SELECT code INTO v_kod FROM billing_plans WHERE id = v_sub.plan_od_nastepnego_okresu;

  UPDATE billing_subscriptions
  SET plan_id                   = v_sub.plan_od_nastepnego_okresu,
      plan_od_nastepnego_okresu = NULL,
      plan_zmiana_zgloszona_at  = NULL,
      updated_at                = now()
  WHERE id = p_sub_id;

  RETURN jsonb_build_object('ok', true, 'stan', 'zastosowana', 'plan', v_kod);
END;
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.billing_zastosuj_odlozona_zmiane(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_zastosuj_odlozona_zmiane(uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

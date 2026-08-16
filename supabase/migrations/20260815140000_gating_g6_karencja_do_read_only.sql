-- G6 — zejście z karencji do trybu odczytu po upływie `grace_period_days`.
--
-- Bez tego `past_due` jest stanem końcowym: webhook ustawia go przy nieudanej
-- płatności i nic go nigdy nie zmienia. Klient z odrzuconą kartą pracowałby
-- w nieskończoność, bo karencja daje PEŁNY dostęp (i słusznie — połowa
-- nieudanych pobrań naprawia się sama przy ponowieniu przez operatora).
--
-- Zadanie robi jedną rzecz: po upływie karencji przestawia `past_due` na
-- `read_only`. Nie kasuje danych, nie anuluje subskrypcji w Stripe, nie
-- wysyła maili — te decyzje należą do klienta i do operatora płatności.

-- ---------------------------------------------------------------------------
-- 1. Od kiedy trwa karencja
-- ---------------------------------------------------------------------------
-- Liczenie po `updated_at` byłoby błędne: każdy zapis w wierszu (choćby zmiana
-- `price_snapshot`) przesuwałby koniec karencji w przyszłość i klient
-- z niedziałającą kartą nigdy by do trybu odczytu nie zszedł.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

-- Znacznik stawia TRIGGER, nie webhook. Do `past_due` da się wejść także
-- ręcznym UPDATE-em w SQL Editorze (tak przełączamy stany przy testach),
-- a znacznik pilnowany w jednym miejscu nie zależy od tego, kto pisze.
CREATE OR REPLACE FUNCTION public.billing_znacznik_karencji()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'past_due' AND COALESCE(OLD.status::text, '') <> 'past_due' THEN
    NEW.past_due_since := now();
  ELSIF NEW.status <> 'past_due' THEN
    -- Wyjście z karencji w którąkolwiek stronę zeruje licznik. Gdyby znacznik
    -- został, ponowne odrzucenie karty za pół roku zeszłoby do trybu odczytu
    -- natychmiast, bez należnej karencji.
    NEW.past_due_since := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_znacznik_karencji ON public.billing_subscriptions;
CREATE TRIGGER trg_billing_znacznik_karencji
  BEFORE INSERT OR UPDATE OF status ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_znacznik_karencji();

-- Uzupełnienie dla wierszy, które są w karencji JUŻ TERAZ. Bez tego zadanie
-- by ich nie widziało (NULL nigdy nie przekroczy progu) i wisiałyby wiecznie.
-- `updated_at` jest tu przybliżeniem, ale jedynym, jakie mamy — i działa na
-- korzyść klienta, bo karencja liczy się od ostatniej zmiany, nie od zera.
UPDATE public.billing_subscriptions
SET past_due_since = COALESCE(updated_at, created_at)
WHERE status = 'past_due' AND past_due_since IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Zadanie
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_zejdz_do_read_only()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_karencja integer;
  v_ile      integer;
BEGIN
  SELECT grace_period_days INTO v_karencja FROM billing_settings WHERE id = true;

  -- Brak konfiguracji nie może oznaczać „zablokuj wszystkich". Przy pustej
  -- tabeli ustawień nie robimy NIC i mówimy o tym w logu — odwrotna
  -- domyślność odcięłaby płacących klientów przez brak jednego wiersza.
  IF v_karencja IS NULL THEN
    RAISE WARNING 'billing_zejdz_do_read_only: brak wiersza billing_settings — pomijam';
    RETURN 0;
  END IF;

  UPDATE billing_subscriptions
  SET status = 'read_only', updated_at = now()
  WHERE status = 'past_due'
    AND past_due_since IS NOT NULL
    AND past_due_since + make_interval(days => v_karencja) < now();

  GET DIAGNOSTICS v_ile = ROW_COUNT;

  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_zejdz_do_read_only: przestawiono % subskrypcji', v_ile;
  END IF;

  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_zejdz_do_read_only() FROM public;
GRANT EXECUTE ON FUNCTION public.billing_zejdz_do_read_only() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Harmonogram
-- ---------------------------------------------------------------------------
-- Raz na dobę wystarczy: karencja liczy się w dniach, a częstsze uruchamianie
-- zmieniałoby tylko godzinę odcięcia, nie dzień.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('billing-karencja-read-only')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-karencja-read-only');

    PERFORM cron.schedule(
      'billing-karencja-read-only',
      '15 3 * * *',
      $cron$ SELECT public.billing_zejdz_do_read_only(); $cron$
    );
  ELSE
    RAISE WARNING 'pg_cron niedostępny — billing_zejdz_do_read_only trzeba wołać z zewnątrz';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Tryb dokończenia, krok 4: wejście w tryb i wyjście z niego.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- JEDNA DROGA DLA OBU POWODÓW
-- ═══════════════════════════════════════════════════════════════════════════
-- Koniec okresu próbnego i nieudana płatność mają działać identycznie. Powód
-- jest PARAMETREM, nie osobną ścieżką — inaczej za miesiąc jedna z nich dostanie
-- poprawkę, a druga nie.
--
-- Wejście stawia WYZWALACZ, nie webhook. Tak samo, jak zrobiono to przy karencji
-- w G6 i z tego samego powodu: do `past_due` da się wejść także ręcznym UPDATE-em
-- w SQL Editorze (tak przełączamy stany przy testach), a znacznik pilnowany
-- w jednym miejscu nie zależy od tego, kto pisze.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KONIEC DWÓCH RÓŻNYCH OKRESÓW KARENCJI
-- ═══════════════════════════════════════════════════════════════════════════
-- Do tej pory `past_due` dawał PEŁNY dostęp przez `grace_period_days` (domyślnie
-- 7 dni kalendarzowych), a dopiero potem zadanie schodziło do trybu odczytu.
-- To był drugi okres karencji, liczony inaczej niż trzy dni robocze.
--
-- Od teraz jest jeden: trzy dni robocze, ten sam dla obu powodów.
-- `grace_period_days` zostaje w tabeli ustawień, ale nic już od niego nie zależy.
--
-- Konsekwencja przyjęta świadomie: klient z odrzuconą kartą wchodzi w tryb
-- dokończenia po PIERWSZEJ nieudanej próbie, a operator ponawia pobranie jeszcze
-- przez kilkanaście dni. Jeśli któraś próba przejdzie, przychodzi `invoice.paid`,
-- status wraca na `active`, a tryb dokończenia czyści się sam — patrz niżej.
-- Klient nie jest stracony; ma trzy dni ograniczonej pracy zamiast siedmiu pełnych.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Wejście i wyjście — jedno miejsce
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_znacznik_karencji()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'past_due' AND COALESCE(OLD.status::text, '') <> 'past_due' THEN
    NEW.past_due_since := now();
    -- Wejście w tryb dokończenia z powodu płatności. `COALESCE` pilnuje, żeby
    -- kolejne nieudane pobranie nie przesuwało terminu w przyszłość: operator
    -- ponawia kilka razy i każde ponowienie przysyła to samo zdarzenie.
    NEW.dokanczanie_do    := COALESCE(NEW.dokanczanie_do,
                                      public.termin_dokonczenia(NEW.subscriber_id));
    NEW.dokanczanie_powod := COALESCE(NEW.dokanczanie_powod, 'platnosc');

  ELSIF NEW.status <> 'past_due' THEN
    -- Wyjście z karencji w którąkolwiek stronę zeruje licznik. Gdyby znacznik
    -- został, ponowne odrzucenie karty za pół roku zeszłoby do trybu odczytu
    -- natychmiast, bez należnej karencji.
    NEW.past_due_since := NULL;

    -- WYJŚCIE Z TRYBU DOKOŃCZENIA: opłacona subskrypcja czyści termin i powód.
    -- To jest realizacja obietnicy „po opłaceniu wszystko wraca natychmiast".
    -- Świadomie NIE czyścimy przy `read_only` ani `expired`: tam tryb dokończenia
    -- już się skończył i jego ślad ma zostać.
    IF NEW.status IN ('active', 'trialing') THEN
      NEW.dokanczanie_do    := NULL;
      NEW.dokanczanie_powod := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Koniec okresu próbnego — zadanie cykliczne
-- ---------------------------------------------------------------------------
-- Okres próbny nie ma zdarzenia od operatora, więc ktoś musi zapytać „czy już".
-- Raz na dobę wystarczy: termin liczy się w dniach, a częstsze uruchamianie
-- zmieniałoby tylko godzinę wejścia, nie dzień.
CREATE OR REPLACE FUNCTION public.billing_konczy_sie_trial()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ile integer;
BEGIN
  UPDATE billing_subscriptions s
  SET dokanczanie_do    = public.termin_dokonczenia(s.subscriber_id),
      dokanczanie_powod = 'trial',
      updated_at        = now()
  WHERE s.status = 'trialing'
    AND s.subscriber_type = 'service_provider'
    -- Okres próbny bez daty jest bezterminowy — wiersze sprzed wprowadzenia
    -- terminów zostają nietknięte.
    AND COALESCE(s.trial_ends_at, s.current_period_end) IS NOT NULL
    AND COALESCE(s.trial_ends_at, s.current_period_end) < now()
    -- Idempotencja: warsztat już w trybie nie dostaje nowego terminu.
    AND s.dokanczanie_do IS NULL;

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_konczy_sie_trial: % warsztatów weszło w tryb dokończenia', v_ile;
  END IF;
  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_konczy_sie_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_konczy_sie_trial() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Twardy blok — przepięcie zadania z G6
-- ---------------------------------------------------------------------------
-- Było: `past_due_since + grace_period_days`. Jest: koniec trybu dokończenia.
-- Obejmuje teraz OBA powody, bo `dokanczanie_do` stawiane jest tak samo dla
-- końca okresu próbnego, jak dla nieudanej płatności.
CREATE OR REPLACE FUNCTION public.billing_zejdz_do_read_only()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ile integer;
BEGIN
  UPDATE billing_subscriptions
  SET status = 'read_only', updated_at = now()
  WHERE status IN ('past_due', 'trialing')
    AND dokanczanie_do IS NOT NULL
    AND dokanczanie_do < now();

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_zejdz_do_read_only: % subskrypcji na twardym bloku', v_ile;
  END IF;
  RETURN v_ile;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Harmonogram
-- ---------------------------------------------------------------------------
-- Kolejność w dobie jest istotna: najpierw wejście w tryb, potem zejście na
-- twardy blok. Odwrotna kazałaby warsztatowi czekać dobę dłużej niż powinien
-- — nieszkodliwie, ale niezgodnie z tym, co pokazuje mu licznik dni.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('billing-koniec-trialu')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-koniec-trialu');
    PERFORM cron.schedule('billing-koniec-trialu', '0 3 * * *',
      $cron$ SELECT public.billing_konczy_sie_trial(); $cron$);
    RAISE NOTICE 'zadanie billing-koniec-trialu: 3:00 UTC';
  ELSE
    RAISE WARNING 'pg_cron niedostępny — billing_konczy_sie_trial trzeba wołać z zewnątrz';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Kontrola
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE proname='billing_zejdz_do_read_only')
     LIKE '%grace_period_days%' THEN
    RAISE EXCEPTION 'Twardy blok nadal liczy po grace_period_days — dwa okresy karencji';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname='billing_znacznik_karencji')
     NOT LIKE '%dokanczanie_do%' THEN
    RAISE EXCEPTION 'Wyzwalacz nie ustawia trybu dokończenia przy nieudanej płatności';
  END IF;
  RAISE NOTICE 'Wejście w tryb: jedno miejsce, jeden okres, oba powody.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

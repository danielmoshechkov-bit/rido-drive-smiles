-- Ósma fikcja: wyzwalacz kasował tryb dokończenia ustawiany w tym samym zapisie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO DZIAŁO SIĘ DOTĄD
-- ═══════════════════════════════════════════════════════════════════════════
-- `trg_billing_znacznik_karencji` chodzi po `UPDATE OF status`, czyli zawsze,
-- gdy `status` znajdzie się na liście SET — także wtedy, gdy nie zmienia
-- wartości. Przy statusie `active` albo `trialing` wyzwalacz zerował
-- `dokanczanie_do`. Zapis mówiący „status trialing ORAZ tryb dokończenia do 28
-- sierpnia" kończył się więc wierszem bez trybu dokończenia — bez błędu,
-- bez ostrzeżenia, bez śladu.
--
-- Prawdziwa ścieżka działa PRZYPADKIEM: `billing_konczy_sie_trial` ustawia
-- termin zapisem, który nie dotyka `status`, więc wyzwalacz nie zaskakuje.
-- To niezapisany warunek „nie wolno zapisywać statusu razem z terminem",
-- którego nic nie pilnuje. Wystarczy, że ktoś napisze naturalny UPDATE
-- dotykający obu kolumn — i tryb dokończenia zniknie bez śladu.
--
-- To, że coś działa przypadkiem, jest gorsze, niż gdyby nie działało: awaria
-- byłaby widoczna, a to nie jest.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO POPRAWKA W WYZWALACZU, A NIE KONTROLA PILNUJĄCA WARUNKU
-- ═══════════════════════════════════════════════════════════════════════════
-- Kontrola — test albo `CHECK` zabraniający zapisywania obu kolumn naraz —
-- zostawiłaby pułapkę na miejscu i tylko postawiła przy niej tabliczkę.
-- Utrwalałaby przy tym regułę, której nie da się uzasadnić przed nikim
-- z zewnątrz: „nie wolno w jednym zapisie ustawić statusu i terminu".
-- To nie jest reguła dziedzinowa, tylko skutek uboczny implementacji.
--
-- Poprawka w wyzwalaczu usuwa pułapkę: zapis znaczy to, co mówi. Kto poda
-- termin wprost, dostanie ten termin. Kto go nie poda, dostaje dotychczasowe
-- zachowanie — czyszczenie przy powrocie do opłaconego stanu, czyli obietnicę
-- „po opłaceniu wszystko wraca natychmiast".
--
-- Kontrola też jest, ale jako DODATEK, nie zamiast: sprawdza, że wyzwalacz
-- nadal rozróżnia oba przypadki.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO TA ZMIANA NIE RUSZA
-- ═══════════════════════════════════════════════════════════════════════════
-- `billing_wydaj_okres` polega na czyszczeniu: zapisuje `status = 'active'`
-- i NIE zapisuje `dokanczanie_do`, więc trafia w gałąź „nie podano terminu"
-- i tryb dokończenia dalej znika po opłaceniu. Sprawdzone zachowaniem.

BEGIN;

CREATE OR REPLACE FUNCTION public.billing_znacznik_karencji()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  -- Czy TEN zapis ustala termin dokończenia sam. Przy INSERT-cie decyduje
  -- sama obecność wartości; przy UPDATE — to, czy różni się od poprzedniej.
  -- `IS DISTINCT FROM` zamiast `<>`, bo `<>` przy NULL-u daje NULL, czyli
  -- „nie wiadomo", a `IF` traktuje to jak fałsz.
  v_zapis_podaje_termin boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_zapis_podaje_termin := NEW.dokanczanie_do IS NOT NULL;
  ELSE
    v_zapis_podaje_termin := NEW.dokanczanie_do IS DISTINCT FROM OLD.dokanczanie_do;
  END IF;

  IF NEW.status = 'past_due' AND COALESCE(OLD.status::text, '') <> 'past_due' THEN
    NEW.past_due_since := now();
    -- Wejście w tryb dokończenia z powodu płatności. `COALESCE` pilnuje, żeby
    -- kolejne nieudane pobranie nie przesuwało terminu w przyszłość: operator
    -- ponawia kilka razy i każde ponowienie przysyła to samo zdarzenie.
    -- Ta gałąź już wcześniej szanowała termin podany wprost — COALESCE bierze
    -- wartość z zapisu, jeśli jest.
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
    --
    -- 🔴 ALE NIE WTEDY, GDY TEN ZAPIS SAM PODAJE TERMIN. Wcześniej wyzwalacz
    -- kasował także wartość, którą wywołujący właśnie ustawiał — cicho.
    IF NEW.status IN ('active', 'trialing') AND NOT v_zapis_podaje_termin THEN
      NEW.dokanczanie_do    := NULL;
      NEW.dokanczanie_powod := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$FUNKCJA$;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $KONTROLA$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'billing_znacznik_karencji';

  IF v_src NOT LIKE '%v_zapis_podaje_termin%' THEN
    RAISE EXCEPTION 'wyzwalacz nie rozróżnia zapisu podającego termin';
  END IF;

  -- Czyszczenie MUSI zostać: bez niego tryb dokończenia przeżyłby opłacenie
  -- i klient płaciłby, dalej widząc pasek „zostały 3 dni".
  IF v_src NOT LIKE '%NEW.dokanczanie_do    := NULL;%' THEN
    RAISE EXCEPTION 'wyzwalacz przestał czyścić tryb dokończenia po opłaceniu';
  END IF;

  -- Wyzwalacz musi dalej wisieć na tabeli — `CREATE OR REPLACE FUNCTION`
  -- nie zakłada go ponownie, a sama funkcja bez wpięcia niczego nie robi.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.billing_subscriptions'::regclass
      AND tgname = 'trg_billing_znacznik_karencji'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'wyzwalacz trg_billing_znacznik_karencji zniknął z tabeli';
  END IF;

  RAISE NOTICE 'Termin podany wprost wygrywa; brak terminu = dotychczasowe czyszczenie.';
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';

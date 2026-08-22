-- Tryb dokończenia, krok 2: zamrożenie tożsamości zlecenia.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEDNO CAŁEGO POMYSŁU
-- ═══════════════════════════════════════════════════════════════════════════
-- W trybie dokończenia warsztat ma DOKOŃCZYĆ to, co zaczął, i NIE ZACZĄĆ nic
-- nowego. Blokada samego zakładania zleceń tego nie załatwia: wystarczy wziąć
-- istniejące zlecenie, podmienić w nim klienta i auto, i obsłużyć nim kolejną
-- osobę. Formalnie „stare" zlecenie, faktycznie nowa robota za darmo.
--
-- Zlecenie to w praktyce para „ten klient, to auto". Zamrażamy WŁAŚNIE JĄ:
--
--   ZAMROŻONE   client_id, vehicle_id, provider_id, order_number
--   OTWARTE     status, daty, notatki, opisy usterki, sumy, znaczniki wyceny
--
-- Pozycje zlecenia zostają otwarte świadomie. Drogą do obsłużenia nowego auta
-- nie jest pozycja, tylko para wyżej — a mechanik, który rozebrał auto i znalazł
-- pękniętą tuleję, musi móc ją dopisać. Inaczej wystawi fakturę niezgodną
-- z robotą albo nie domknie zlecenia, czyli dokładnie tego, na co dajemy czas.
--
-- Kartoteki klientów i pojazdów nie trzeba tu ruszać: bramka zapisu z G4 i tak
-- ich nie przepuszcza, gdy `moze_pracowac` zwraca fałsz. Zamrożenie pary
-- w zleceniu zamyka drugą drogę — przepisanie istniejącego klienta na inne
-- nazwisko.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO WYZWALACZ, A NIE POLITYKA
-- ═══════════════════════════════════════════════════════════════════════════
-- Polityka RLS nie widzi `OLD` ani `NEW`. Zdanie „wolno zmienić status, nie
-- wolno danych" jest w niej NIE DO WYRAŻENIA. Wyzwalacz widzi obie wersje
-- wiersza, więc to jedyne miejsce, w którym da się postawić tę granicę
-- w bazie — a warunek brzmiał: egzekwowane w bazie, nie w formularzu.
--
-- Skutek uboczny, celowy: wyzwalacz działa NIEZALEŻNIE OD DROGI ZAPISU. Nie
-- obchodzi go, czy zapis przyszedł ze starego okna edycji, z nowej wyszukiwarki
-- klientów i pojazdów, czy z klucza serwisowego (który omija RLS, ale nie
-- omija wyzwalaczy). Nie ma listy ekranów do utrzymywania.

BEGIN;

CREATE OR REPLACE FUNCTION public.straz_dokanczania_zlecenia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_provider uuid := COALESCE(NEW.provider_id, OLD.provider_id);
  v_zmienione text;
BEGIN
  -- Pełny dostęp — wyzwalacz nie ma nic do powiedzenia.
  IF public.moze_pracowac(v_provider, 'warsztat') THEN
    RETURN NEW;
  END IF;

  -- Nie w trybie dokończenia — o zapisie i tak decyduje bramka z G4.
  -- Nie dokładamy tu drugiej odmowy, żeby komunikat miał jedno źródło.
  IF NOT public.wolno_dokanczac(v_provider, 'warsztat') THEN
    RETURN NEW;
  END IF;

  -- Tryb dokończenia: tożsamość zlecenia jest zamrożona.
  v_zmienione := concat_ws(', ',
    CASE WHEN NEW.client_id    IS DISTINCT FROM OLD.client_id    THEN 'klienta'  END,
    CASE WHEN NEW.vehicle_id   IS DISTINCT FROM OLD.vehicle_id   THEN 'pojazd'   END,
    CASE WHEN NEW.provider_id  IS DISTINCT FROM OLD.provider_id  THEN 'warsztat' END,
    CASE WHEN NEW.order_number IS DISTINCT FROM OLD.order_number THEN 'numer zlecenia' END
  );

  IF v_zmienione IS NOT NULL AND v_zmienione <> '' THEN
    -- Kod na początku komunikatu, żeby interfejs mógł rozpoznać powód bez
    -- zgadywania po treści — tak samo jak `BRAK_SMS` przy wysyłce.
    RAISE EXCEPTION
      'TRYB_DOKONCZENIA: okres próbny dobiegł końca — możesz dokończyć rozpoczęte '
      'zlecenia, ale nie zmienisz w nich %. Wykup plan, żeby wrócić do pełnej pracy.',
      v_zmienione;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_straz_dokanczania_zlecenia ON public.workshop_orders;
CREATE TRIGGER trg_straz_dokanczania_zlecenia
  BEFORE UPDATE ON public.workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.straz_dokanczania_zlecenia();

-- Wyzwalacz jest SECURITY DEFINER i woła dwie funkcje bramki; obie też są
-- SECURITY DEFINER, więc działa niezależnie od uprawnień piszącego.
REVOKE ALL ON FUNCTION public.straz_dokanczania_zlecenia() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- TRYB DOKOŃCZENIA — CZTERY KROKI, JEDNO WKLEJENIE
-- ═══════════════════════════════════════════════════════════════════════════
-- Złożone z czterech migracji, każda w osobnej transakcji:
--   20260822120000  podstawy: kolumny, dni robocze ze świętami, wolno_dokanczac
--   20260822130000  zamrożenie tożsamości zlecenia (wyzwalacz)
--   20260822140000  bramka wpuszcza dokańczanie
--   20260822150000  wejście w tryb, wyjście, koniec dwóch okresów karencji
--
-- Osobne transakcje są zamierzone: gdyby któraś część padła, poprzednie
-- zostają w spójnym stanie, a Ty wiesz dokładnie, na której się zatrzymało.
--
-- Czego się spodziewać na końcu każdej części:
--   część 3: NOTICE  Bramka: dokańczanie na zleceniu i pozycjach, ...
--   część 4: NOTICE  Wejście w tryb: jedno miejsce, jeden okres, oba powody.
--
-- Po wykonaniu NIKT NIE JEST jeszcze w trybie dokończenia — zadanie wprowadzi
-- w niego warsztaty z wygasłym okresem próbnym przy najbliższym uruchomieniu
-- (3:00 UTC). To siedem kont testowych.
-- ═══════════════════════════════════════════════════════════════════════════


-- ══════════════════════════ 20260822120000_tryb_dokonczenia_1_podstawy ══════════════════════════

-- Tryb dokończenia, krok 1 z kilku: kolumny, dni robocze, funkcja decyzyjna.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO TO JEST
-- ═══════════════════════════════════════════════════════════════════════════
-- Dziś bramka zna dwa stany: wolno pracować albo nie. Za mało precyzyjne.
-- Warsztat, któremu kończy się okres próbny albo któremu nie przeszła karta,
-- dostaje TRZY DNI ROBOCZE na domknięcie pracy w toku: ma dokończyć to, co
-- zaczął, i nie zacząć nic nowego. Potem twardy blok.
--
-- Powód wejścia w tryb jest PARAMETREM, nie osobną ścieżką: koniec okresu
-- próbnego i nieudana płatność mają działać identycznie i tak samo się kończyć.
--
-- Ta migracja NIE ZMIENIA jeszcze niczyjego dostępu. Zakłada kolumny i funkcje,
-- z których korzystają kolejne kroki. `wolno_dokanczac` nie jest jeszcze wołane
-- z żadnej polityki — wpięcie to osobny krok, żeby dało się je sprawdzić osobno.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Kolumny
-- ---------------------------------------------------------------------------
-- `dokanczanie_do` jest ZAMROŻONYM terminem, nie regułą liczoną na żywo.
-- Gdyby termin wyliczał się przy każdym pytaniu z bieżących godzin pracy,
-- warsztat zmieniający ustawienia przesuwałby sobie własny termin — w obie
-- strony. Data zapisana raz jest sprawdzalna i identyczna z tą, którą pokazuje
-- pasek w interfejsie.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS dokanczanie_do    timestamptz,
  ADD COLUMN IF NOT EXISTS dokanczanie_powod text;

DO $$ BEGIN
  ALTER TABLE public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_dokanczanie_powod
    CHECK (dokanczanie_powod IS NULL OR dokanczanie_powod IN ('trial', 'platnosc'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.billing_subscriptions.dokanczanie_do IS
  'Zamrożony termin twardego bloku. NULL = warsztat nie jest w trybie dokończenia.';
COMMENT ON COLUMN public.billing_subscriptions.dokanczanie_powod IS
  'Dlaczego wszedł w tryb: trial (koniec okresu próbnego) albo platnosc (karta nie przeszła). '
  'Wyłącznie do komunikatu — zasady są identyczne dla obu.';

-- ---------------------------------------------------------------------------
-- 2. Dni wolne od pracy w Polsce
-- ---------------------------------------------------------------------------
-- Funkcja, nie tabela. Tabela wymagałaby dopisywania kolejnych lat i pierwszy
-- pominięty rok cicho skróciłby komuś termin. Daty stałe plus trzy ruchome
-- liczone od Wielkanocy (algorytm Meeusa/Jonesa/Butchera — kalendarz gregoriański).
CREATE OR REPLACE FUNCTION public.wielkanoc(p_rok integer)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int; i int;
        k int; l int; m int; miesiac int; dzien int;
BEGIN
  a := p_rok % 19;
  b := p_rok / 100;
  c := p_rok % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  miesiac := (h + l - 7 * m + 114) / 31;
  dzien := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_rok, miesiac, dzien);
END;
$$;

CREATE OR REPLACE FUNCTION public.dni_wolne_pl(p_rok integer)
RETURNS date[]
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v_w date := public.wielkanoc(p_rok);
BEGIN
  RETURN ARRAY[
    make_date(p_rok,  1,  1),   -- Nowy Rok
    make_date(p_rok,  1,  6),   -- Trzech Króli
    v_w + 1,                    -- Poniedziałek Wielkanocny
    make_date(p_rok,  5,  1),   -- Święto Pracy
    make_date(p_rok,  5,  3),   -- Święto Konstytucji
    v_w + 60,                   -- Boże Ciało
    make_date(p_rok,  8, 15),   -- Wniebowzięcie
    make_date(p_rok, 11,  1),   -- Wszystkich Świętych
    make_date(p_rok, 11, 11),   -- Święto Niepodległości
    -- Wigilia jest dniem ustawowo wolnym od 2025 roku (nowelizacja z 2024).
    -- Dla lat wcześniejszych była dniem pracującym — stąd warunek, żeby
    -- funkcja nie kłamała o przeszłości, gdyby ktoś liczył wstecz.
    CASE WHEN p_rok >= 2025 THEN make_date(p_rok, 12, 24) END,
    make_date(p_rok, 12, 25),
    make_date(p_rok, 12, 26)
    -- Niedziela Wielkanocna i Zesłanie Ducha Świętego wypadają w niedzielę,
    -- która i tak nie jest dniem roboczym — nie dokładamy ich, żeby nie liczyć
    -- tego samego dnia dwa razy.
  ];
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Termin: trzy dni robocze od chwili wejścia w tryb
-- ---------------------------------------------------------------------------
-- Dzień roboczy = poniedziałek–piątek minus święta.
--
-- GODZINY PRACY WARSZTATU biorą udział TYLKO wtedy, gdy da się je odczytać
-- w znanym kształcie, i TYLKO po to, żeby pominąć dodatkowe dni zamknięte —
-- nigdy żeby termin skrócić. Powód: w tej bazie godziny pracy żyją w trzech
-- miejscach o trzech różnych kształtach (`service_working_hours` — tabela,
-- niedziela = 0; `workshop_settings.working_hours` — tablica siedmiu pozycji,
-- indeks 0 = poniedziałek; `service_providers.working_hours` — jsonb, w praktyce
-- pusty). Kalendarz czyta pierwsze, ekran ustawień pisze do drugiego i nikt ich
-- nie synchronizuje. Opieranie terminu na takim źródle byłoby loterią.
--
-- SUFIT: nigdy więcej niż 10 dni kalendarzowych. Warsztat z ustawieniem
-- „otwarte w środy" nie dostanie trzech tygodni.
CREATE OR REPLACE FUNCTION public.termin_dokonczenia(
  p_provider uuid,
  p_od       timestamptz DEFAULT now(),
  p_dni      integer     DEFAULT 3
)
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_dzien   date := (p_od AT TIME ZONE 'Europe/Warsaw')::date;
  v_sufit   date := v_dzien + 10;
  v_zostalo integer := GREATEST(p_dni, 1);
  v_godziny jsonb;
  v_otwarte boolean;
  v_swieta  date[];
BEGIN
  -- Kształt znany = tablica siedmiu pozycji z polem `open`. Cokolwiek innego
  -- ignorujemy i zostajemy przy poniedziałek–piątek.
  SELECT ws.working_hours INTO v_godziny
  FROM workshop_settings ws
  JOIN service_providers sp ON sp.user_id = ws.user_id
  WHERE sp.id = p_provider
  LIMIT 1;

  IF jsonb_typeof(v_godziny) <> 'array' OR jsonb_array_length(v_godziny) <> 7 THEN
    v_godziny := NULL;
  END IF;

  WHILE v_zostalo > 0 AND v_dzien < v_sufit LOOP
    v_dzien := v_dzien + 1;
    v_swieta := public.dni_wolne_pl(EXTRACT(YEAR FROM v_dzien)::int);

    CONTINUE WHEN EXTRACT(ISODOW FROM v_dzien) > 5;   -- sobota, niedziela
    CONTINUE WHEN v_dzien = ANY (v_swieta);

    IF v_godziny IS NOT NULL THEN
      -- ISODOW: 1 = poniedziałek. Tablica: indeks 0 = poniedziałek.
      v_otwarte := COALESCE(
        (v_godziny -> (EXTRACT(ISODOW FROM v_dzien)::int - 1) ->> 'open')::boolean, true);
      CONTINUE WHEN NOT v_otwarte;
    END IF;

    v_zostalo := v_zostalo - 1;
  END LOOP;

  -- Koniec dnia roboczego, nie chwila wejścia w tryb: klient ma cały ostatni
  -- dzień, a nie jego ułamek zależny od godziny, o której zadziałało zadanie.
  --                     ↓ `::timestamp`, NIE `::timestamptz`.
  -- `timestamptz AT TIME ZONE 'strefa'` zwraca timestamp BEZ strefy, który
  -- potem rzutuje się z powrotem po strefie SERWERA (na Supabase: UTC) — czyli
  -- cicho przesuwa termin o dwie godziny. `timestamp AT TIME ZONE 'strefa'`
  -- robi to, o co chodzi: bierze północ w Warszawie i daje moment na osi czasu.
  RETURN (v_dzien + 1)::timestamp AT TIME ZONE 'Europe/Warsaw';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Czy ten warsztat jest w trybie dokończenia
-- ---------------------------------------------------------------------------
-- Świadomie OSOBNA funkcja, a nie zmiana `moze_pracowac`. Tamta zwraca wartość
-- logiczną i siedzi w politykach trzydziestu tabel; zmiana jej znaczenia
-- wymagałaby przebudowania wszystkich naraz. Tu dokładamy drugie pytanie,
-- które polityki będą zadawać obok pierwszego.
CREATE OR REPLACE FUNCTION public.wolno_dokanczac(p_provider uuid, p_linia text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_do timestamptz;
BEGIN
  IF p_provider IS NULL OR p_linia IS NULL THEN
    RETURN false;                      -- fail-closed, jak reszta bramki
  END IF;

  SELECT dokanczanie_do INTO v_do
  FROM billing_subscriptions
  WHERE subscriber_type = 'service_provider'
    AND subscriber_id   = p_provider
    -- Rzutujemy KOLUMNĘ na tekst, nie parametr na typ wyliczeniowy — patrz G4.
    AND product_line::text = p_linia
  ORDER BY created_at DESC LIMIT 1;

  RETURN v_do IS NOT NULL AND v_do > now();
END;
$$;

REVOKE ALL ON FUNCTION public.wolno_dokanczac(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.wolno_dokanczac(uuid, text) TO authenticated, anon, service_role;
REVOKE ALL ON FUNCTION public.termin_dokonczenia(uuid, timestamptz, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.termin_dokonczenia(uuid, timestamptz, integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════ 20260822130000_tryb_dokonczenia_2_zamrozenie ══════════════════════════

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
REVOKE ALL ON FUNCTION public.straz_dokanczania_zlecenia() FROM public;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════ 20260822140000_tryb_dokonczenia_3_bramka ══════════════════════════

-- Tryb dokończenia, krok 3: bramka wpuszcza dokańczanie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ ZMIENIA
-- ═══════════════════════════════════════════════════════════════════════════
-- Do tej pory bramka znała jedną odpowiedź: `moze_pracowac`. Teraz dla TRZECH
-- rzeczy dokłada drugą — `wolno_dokanczac`:
--
--   workshop_orders            UPDATE i DELETE
--   workshop_order_items       INSERT, UPDATE, DELETE   (i pliki, zdjęcia, podpisy)
--
-- INSERT na `workshop_orders` zostaje ZAMKNIĘTY. To jest cała różnica między
-- „dokończ, co zacząłeś" a „pracuj dalej".
--
-- DELETE na zleceniu wpuszczamy świadomie: warsztat i tak nie założy nowego
-- w jego miejsce, więc kasowanie nie jest drogą obejścia — a bywa jedynym
-- sposobem sprzątnięcia pomyłki.
--
-- Pozycje otwarte, bo tożsamości zlecenia pilnuje wyzwalacz z kroku 2. Para
-- klient–pojazd jest zamrożona, więc każda dopisana pozycja obciąża dalej tego
-- samego klienta za to samo auto.
--
-- WSZYSTKIE POZOSTAŁE TABELE zostają zamknięte bez zmian — w tym kartoteki
-- klientów i pojazdów. To zamyka drugą drogę obejścia: przepisanie istniejącego
-- klienta na inne nazwisko zamiast podmiany go w zleceniu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO PRZEBUDOWA PROCEDURY, A NIE DOŁOŻENIE POLITYKI
-- ═══════════════════════════════════════════════════════════════════════════
-- Polityki bramki są RESTRICTIVE, czyli łączą się przez AND. Dołożenie obok
-- kolejnej polityki niczego by nie OTWARŁO — tylko dodało kolejny warunek do
-- spełnienia. Wyjątek trzeba wpisać w warunek istniejącej polityki, a te
-- generuje procedura. Stąd nowa wersja procedury z tą samą sygnaturą: wywołania
-- z G0 i z migracji nowych tabel działają dalej bez zmian.

BEGIN;

CREATE OR REPLACE PROCEDURE public.warsztat_zaloz_bramke(p_dodatkowy_warunek text DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  t text; warunek text; kolumna text; warunek_dokanczania text;
  przez_zlecenie text[] := public.warsztat_tabele_przez_zlecenie();
BEGIN
  FOREACH t IN ARRAY public.warsztat_tabele_wprost() || przez_zlecenie LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'pomijam % — brak tabeli', t; CONTINUE;
    END IF;

    -- Wyrażenie wskazujące warsztat: wprost albo przez zlecenie nadrzędne.
    IF t = ANY (przez_zlecenie) THEN
      kolumna := '(SELECT o.provider_id FROM public.workshop_orders o WHERE o.id = order_id)';
    ELSE
      kolumna := 'provider_id';
    END IF;

    warunek := format('public.moze_pracowac(%s, ''warsztat'')', kolumna);
    IF p_dodatkowy_warunek IS NOT NULL THEN
      warunek := warunek || ' OR ' || replace(p_dodatkowy_warunek, '%KOLUMNA%', kolumna);
    END IF;

    -- Tryb dokończenia dotyczy WYŁĄCZNIE zlecenia i jego pozycji.
    IF t = 'workshop_orders' OR t = ANY (przez_zlecenie) THEN
      warunek_dokanczania := warunek || format(' OR public.wolno_dokanczac(%s, ''warsztat'')', kolumna);
    ELSE
      warunek_dokanczania := warunek;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_delete', t);

    -- INSERT: na samym zleceniu tryb dokończenia NIE pomaga — nowego nie założy.
    -- Na pozycjach pomaga, bo dopisanie części do zlecenia w toku jest właśnie
    -- dokańczaniem.
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (%s)',
      'warsztat_zapis_insert', t,
      CASE WHEN t = 'workshop_orders' THEN warunek ELSE warunek_dokanczania END);

    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (%s) WITH CHECK (%s)',
      'warsztat_zapis_update', t, warunek_dokanczania, warunek_dokanczania);

    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (%s)',
      'warsztat_zapis_delete', t, warunek_dokanczania);
  END LOOP;
END;
$$;

-- Odtworzenie polityk z furtką serwisową administratora — tak samo jak G0
-- i migracja nowych tabel. Pominięcie tego argumentu odebrałoby administratorowi
-- okna serwisowe.
CALL public.warsztat_zaloz_bramke('public.ma_okno_serwisowe(%KOLUMNA%)');

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_brak text;
BEGIN
  -- Zlecenie i pozycje mają znać tryb dokończenia...
  SELECT string_agg(tablename || '.' || cmd, ', ') INTO v_brak
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('workshop_orders', 'workshop_order_items')
    AND policyname LIKE 'warsztat_zapis_%'
    AND cmd IN ('UPDATE', 'DELETE')
    AND qual NOT LIKE '%wolno_dokanczac%';
  IF v_brak IS NOT NULL THEN
    RAISE EXCEPTION 'Bramka nie zna trybu dokończenia dla: %', v_brak;
  END IF;

  -- ...a zakładanie zleceń NIE.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workshop_orders'
      AND policyname='warsztat_zapis_insert' AND with_check LIKE '%wolno_dokanczac%'
  ) THEN
    RAISE EXCEPTION 'Zakładanie zleceń przepuszcza tryb dokończenia — to nie jest dokańczanie';
  END IF;

  -- Kartoteki zostają zamknięte.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('workshop_clients','workshop_vehicles')
      AND policyname LIKE 'warsztat_zapis_%' AND COALESCE(qual, with_check) LIKE '%wolno_dokanczac%'
  ) THEN
    RAISE EXCEPTION 'Kartoteka klientów lub pojazdów przepuszcza tryb dokończenia';
  END IF;

  RAISE NOTICE 'Bramka: dokańczanie na zleceniu i pozycjach, zakładanie i kartoteki zamknięte.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════ 20260822150000_tryb_dokonczenia_4_wejscie ══════════════════════════

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

REVOKE ALL ON FUNCTION public.billing_konczy_sie_trial() FROM public;
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

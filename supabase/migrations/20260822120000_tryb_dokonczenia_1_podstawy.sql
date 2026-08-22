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

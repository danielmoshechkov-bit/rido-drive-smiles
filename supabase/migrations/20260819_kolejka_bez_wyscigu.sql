-- ============================================================================
-- POBRANIE ZADANIA I REZERWACJA NUMERU — ATOMOWO, BEZ ZALEŻNOŚCI OD PostgREST
--
-- Dwa miejsca w `voice-numbers-worker` brały „jeden wiersz z wielu" przez
-- warstwę REST:
--
--   kolejka:    .select().in(status).lte(nastepna_proba).order(created_at).limit(1)
--               a potem OSOBNYM zapytaniem .update(status='w_toku')
--   pula:       .update({...}).eq('status','wolny').is('provider_id', null)
--                             .select('*').limit(1).maybeSingle()
--
-- Pierwsze ma okno między odczytem a zapisem: dwa przebiegi obok siebie
-- (cron chodzi co minutę, a przebieg potrafi trwać dłużej niż minutę, bo czeka
-- na operatora) biorą TO SAMO zadanie i wykonują je dwa razy. Przy zadaniu,
-- które KUPUJE NUMER, to są prawdziwe pieniądze.
--
-- Drugie jest gorsze, bo nie wiem, co dokładnie robi. `limit` przy UPDATE to
-- rozszerzenie PostgREST-a, a nie SQL — i nie sprawdziłem, czy w tej wersji
-- ogranicza liczbę ZMIENIANYCH wierszy, czy tylko liczbę ZWRACANYCH. Jeśli to
-- drugie, pierwsza aktywacja przy pełniejszej puli przypisuje jednemu
-- warsztatowi WSZYSTKIE wolne numery, a my zobaczymy jeden i uznamy, że dobrze.
-- Nie sprawdziłem tego, bo sprawdzenie wymagałoby albo zmiany danych na
-- produkcji, albo pobrania klucza service_role — jedno i drugie jest zakazane.
--
-- Zamiast ustalać, jak zachowuje się cudza warstwa, usuwam zależność od niej.
-- `FOR UPDATE SKIP LOCKED` to standardowy sposób na kolejkę: wiersz zajęty
-- przez inny przebieg jest POMIJANY, a nie oczekiwany — więc dwa przebiegi
-- nigdy nie dostaną tego samego zadania ani tego samego numeru.
--
-- Porządek `(created_at, id)` zamyka remis: `created_at` potrafi być identyczny
-- dla wierszy wstawionych w tej samej transakcji.
-- ============================================================================

-- ZADANIE Z KOLEJKI — pobranie i oznaczenie jako „w toku" w JEDNEJ operacji.
CREATE OR REPLACE FUNCTION public.voice_pobierz_zadanie()
RETURNS public.voice_number_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wybrane public.voice_number_jobs;
BEGIN
  SELECT * INTO wybrane
    FROM public.voice_number_jobs
   WHERE status = 'oczekuje'
     AND nastepna_proba <= now()
   ORDER BY created_at, id
     FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.voice_number_jobs
     SET status = 'w_toku', updated_at = now()
   WHERE id = wybrane.id
   RETURNING * INTO wybrane;

  RETURN wybrane;
END;
$$;

-- REZERWACJA NUMERU Z PULI — dokładnie jeden wiersz, dla dokładnie jednego
-- warsztatu. Warunek `status = 'wolny' AND provider_id IS NULL` zostaje
-- w zapytaniu, więc funkcja jest bezpieczna także przy powtórnym wywołaniu.
CREATE OR REPLACE FUNCTION public.voice_zarezerwuj_numer(p_provider uuid)
RETURNS public.voice_numbers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wybrany public.voice_numbers;
BEGIN
  IF p_provider IS NULL THEN
    RAISE EXCEPTION 'voice_zarezerwuj_numer: brak p_provider';
  END IF;

  SELECT * INTO wybrany
    FROM public.voice_numbers
   WHERE status = 'wolny'
     AND provider_id IS NULL
   ORDER BY created_at, id
     FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.voice_numbers
     SET provider_id = p_provider,
         status = 'przypisywany',
         updated_at = now()
   WHERE id = wybrany.id
   RETURNING * INTO wybrany;

  RETURN wybrany;
END;
$$;

-- OBIE FUNKCJE SĄ `SECURITY DEFINER` I OMIJAJĄ RLS, więc nie mogą być dostępne
-- dla nikogo poza workerem. Warsztat, który mógłby zawołać `voice_zarezerwuj_numer`,
-- przypisywałby sobie numery z naszej puli bez płacenia.
REVOKE ALL ON FUNCTION public.voice_pobierz_zadanie() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_zarezerwuj_numer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_pobierz_zadanie() TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_zarezerwuj_numer(uuid) TO service_role;

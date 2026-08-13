-- ============================================================================
-- LICZNIKI — dwie funkcje, których kod wołał od zawsze, a których nigdy nie było.
--
-- `increment_guest_usage` i `increment_listing_counter` figurowały w kodzie jako
-- `.rpc(...)`, ale nie istniały w żadnym schemacie. To NIE jest odtworzenie —
-- piszemy je od nowa, dlatego nowa nazwa dla pierwszej z nich (`guest_usage_touch`):
-- robi więcej niż sam licznik i nie udaje, że wraca coś, co kiedyś działało.
--
-- Przy okazji naprawiamy dwa błędy w tej samej ścieżce:
--
--  1. `ai_guest_usage` był zapisywany upsertem z `query_count: 1`, więc licznik
--     przy konflikcie NADPISYWAŁ się jedynką zamiast rosnąć. Limit dzienny
--     (domyślnie 3) nigdy nie mógł zadziałać.
--  2. UNIQUE (ip_address, device_fingerprint, usage_date) przy NULL-owym
--     fingerprincie nie łapie konfliktu — w Postgresie NULL-e są w indeksie
--     unikalnym różne. Każde żądanie bez fingerprintu zakładało NOWY wiersz,
--     a odczyt limitu robił `.maybeSingle()`, który przy wielu wierszach zwraca
--     błąd. Błąd był ignorowany, więc limit milczał podwójnie.
--
-- Dlatego wiersze z NULL-owym fingerprintem kasujemy (17 sztuk, wyłącznie IP
-- `test` i `unknown`, każdy z licznikiem 1 — nie ma czego ratować), a furtkę
-- zamykamy strukturalnie: NOT NULL DEFAULT ''. Po tej migracji NULL nie ma jak
-- wrócić, a jedynym pisarzem do tabeli jest `guest_usage_touch`.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------- 1. NOWE KOLUMNY
ALTER TABLE public.ai_guest_usage
  ADD COLUMN IF NOT EXISTS window_start timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS window_count integer NOT NULL DEFAULT 0;

-- ------------------------------------------ 2. USUNIĘCIE WIERSZY Z NULL-em
--
-- Pierwsze podejście (13.08) próbowało zamienić NULL na '' i padło na 23505:
-- dla tej samej pary IP + data istniał już wiersz z pustym fingerprintem.
--
-- Diagnostyka pokazała 3 kolizyjne klucze, 17 wierszy, 17 zapytań — wyłącznie
-- IP `test` i `unknown`, każdy wiersz z licznikiem 1. Nie ma czego sumować,
-- więc kasujemy zamiast scalać. Kasujemy WSZYSTKIE wiersze z NULL-em, nie tylko
-- kolizyjne: pojedynczy NULL poza kolizją przeszedłby normalizację, ale gdyby
-- taki gdzieś został, `SET NOT NULL` niżej i tak by się o niego rozbił.
DELETE FROM public.ai_guest_usage WHERE device_fingerprint IS NULL;

-- Zamknięcie furtki na stałe. Po usunięciu upsertu z `ai-search` jedynym
-- pisarzem do tej tabeli jest `guest_usage_touch`, który robi COALESCE —
-- więc NULL nie ma jak wrócić, a ograniczenie unikalne przestaje być dziurawe.
ALTER TABLE public.ai_guest_usage ALTER COLUMN device_fingerprint SET DEFAULT '';
ALTER TABLE public.ai_guest_usage ALTER COLUMN device_fingerprint SET NOT NULL;

-- ------------------------------------------------------- 3. LIMIT DZIENNY
-- Wyszukiwarka AI ma zostać otwarta bez logowania — to funkcja akwizycyjna.
-- Limit dzienny jest bezpiecznikiem przed skryptem, nie polityką produktu.
ALTER TABLE public.ai_settings ALTER COLUMN guest_daily_limit SET DEFAULT 50;
UPDATE public.ai_settings SET guest_daily_limit = 50 WHERE guest_daily_limit = 3;

-- --------------------------------------------------- 4. LICZNIK GOŚCIA
/**
 * Odnotowanie zapytania gościa i zwrot obu liczników w jednym przebiegu.
 *
 * Liczymy PRZY SPRAWDZENIU limitu, nie po odpowiedzi modelu: skrypt bijący
 * w endpoint ma być policzony także wtedy, gdy dostanie odmowę.
 */
CREATE OR REPLACE FUNCTION public.guest_usage_touch(
  p_ip              text,
  p_fingerprint     text,
  p_date            date,
  p_window_seconds  integer DEFAULT 60
)
RETURNS TABLE (daily_count integer, window_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.ai_guest_usage AS g
    (ip_address, device_fingerprint, usage_date, query_count, window_start, window_count)
  VALUES
    (COALESCE(NULLIF(p_ip, ''), 'unknown'), COALESCE(p_fingerprint, ''), p_date, 1, now(), 1)
  ON CONFLICT (ip_address, device_fingerprint, usage_date) DO UPDATE
  SET query_count  = g.query_count + 1,
      window_start = CASE
                       WHEN now() - g.window_start > make_interval(secs => p_window_seconds)
                       THEN now() ELSE g.window_start
                     END,
      window_count = CASE
                       WHEN now() - g.window_start > make_interval(secs => p_window_seconds)
                       THEN 1 ELSE g.window_count + 1
                     END
  RETURNING g.query_count, g.window_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guest_usage_touch(text, text, date, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.guest_usage_touch(text, text, date, integer) TO service_role;

-- --------------------------------------------- 5. LICZNIK NA OGŁOSZENIU
/**
 * Atomowy licznik interakcji na ogłoszeniu.
 *
 * Dotąd edge robił odczyt-i-zapis w dwóch zapytaniach: dwa równoczesne wejścia
 * odczytywały tę samą wartość i oba zapisywały N+1, gubiąc jedno wyświetlenie.
 *
 * Nazwa tabeli i kolumny NIE trafiają do zapytania wprost — przechodzą przez
 * białą listę i `format(%I)`. Parametr sterujący identyfikatorem SQL to inaczej
 * gotowy wektor wstrzyknięcia.
 */
CREATE OR REPLACE FUNCTION public.increment_listing_counter(
  p_table      text,
  p_listing_id uuid,
  p_column     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
       (p_table = 'real_estate_listings'
        AND p_column IN ('view_count', 'favorite_count', 'comparison_count', 'contact_reveals_count'))
    OR (p_table = 'general_listings'
        AND p_column = 'views_count')
  ) THEN
    RAISE EXCEPTION 'increment_listing_counter: niedozwolona para %/%', p_table, p_column;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    p_table, p_column, p_column
  ) USING p_listing_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_listing_counter(text, uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_listing_counter(text, uuid, text) TO service_role;

COMMIT;

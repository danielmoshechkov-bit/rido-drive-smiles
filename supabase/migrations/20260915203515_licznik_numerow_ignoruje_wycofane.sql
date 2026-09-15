-- ═══════════════════════════════════════════════════════════════════════════
-- LICZNIK NUMERÓW CZYTA `007-WYCOFANA-2` JAKO SIEDEMDZIESIĄT DWA
-- ═══════════════════════════════════════════════════════════════════════════
-- `get_next_invoice_number` bierze `MAX(...)+1` po członie po trzecim ukośniku,
-- po czym USUWA z niego wszystko, co nie jest cyfrą:
--
--   regexp_replace(split_part('FV/2026/08/007-WYCOFANA-2', '/', 4), '\D', '', 'g')
--     → '0072'  → 72
--
-- Wiersze z sufiksem `-WYCOFANA-n` powstały przy ręcznym wycofywaniu numerów
-- (migracje `20260910104210` i `20260910150115`) i są w bazie na stałe.
-- Skutek: licznik w trzech seriach zwraca liczbę kilkadziesiąt razy za dużą.
--
-- ZMIERZONE NA PRODUKCJI, 15.09.2026:
--
--   FV/2026/02   zwróci 12, a powinien 2
--   FV/2026/07   zwróci 73, a powinien 10
--   FV/2026/08   zwróci 73, a powinien 10
--
-- Dziś to nie boli, bo numer nadaje się w bieżącym miesiącu (FV/2026/09 jest
-- czysta). Zaboli przy PIERWSZEJ fakturze wystawionej wstecz do lutego, lipca
-- albo sierpnia — warsztat dostanie numer 73 zamiast 10 i nie dowie się, czemu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POPRAWKA: LICZYMY TYLKO TO, CO JEST NUMEREM SERII
-- ═══════════════════════════════════════════════════════════════════════════
-- Zamiast „wyrzuć znaki niebędące cyframi" — „weź wyłącznie wiersze, których
-- człon jest SAMYMI cyframi". `007-WYCOFANA-2` nie jest numerem w tej serii
-- i nie ma prawa wpływać na licznik.
--
-- To nie zmienia zasady „numer raz wystawiony nie wraca": wiersz skasowany
-- z czystym numerem (np. `FV/2026/08/002`) nadal jest liczony i nadal blokuje
-- ten numer. Zmienia się wyłącznie to, że śmieć po ręcznym wycofaniu przestaje
-- udawać numer.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
  p_user_id uuid,
  p_year    integer,
  p_month   integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funkcja$
DECLARE
  next_num integer;
BEGIN
  -- Szeregowanie wydawania numerów w obrębie (użytkownik, rok, miesiąc).
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_year || ':' || p_month, 0)
  );

  SELECT COALESCE(MAX(split_part(invoice_number, '/', 4)::int), 0) + 1
  INTO next_num
  FROM public.user_invoices
  WHERE user_id = p_user_id
    AND invoice_number LIKE ('FV/' || p_year || '/' || lpad(p_month::text, 2, '0') || '/%')
    -- 🔴 TYLKO SAME CYFRY. `007-WYCOFANA-2` nie jest numerem w tej serii.
    AND split_part(invoice_number, '/', 4) ~ '^[0-9]+$';

  RETURN next_num;
END;
$funkcja$;

REVOKE ALL ON FUNCTION public.get_next_invoice_number(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number(uuid, integer, integer) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — NA PRAWDZIWYCH SERIACH, W OBIE STRONY
-- ═══════════════════════════════════════════════════════════════════════════
DO $kontrola$
DECLARE
  v_user  uuid;
  v_nast  integer;
  v_max   integer;
BEGIN
  -- Bierzemy użytkownika, który MA w bazie wiersz z sufiksem — na nim
  -- poprzednia wersja liczyła źle.
  SELECT user_id INTO v_user FROM public.user_invoices
   WHERE invoice_number LIKE 'FV/2026/08/%WYCOFANA%' LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'Brak wierszy z sufiksem — kontrola pominięta, poprawka i tak jest bezpieczna.';
    RETURN;
  END IF;

  -- 1. KONTROLA POZYTYWNA: licznik ma zwrócić następny po NAJWIĘKSZYM CZYSTYM.
  SELECT MAX(split_part(invoice_number, '/', 4)::int) INTO v_max
    FROM public.user_invoices
   WHERE user_id = v_user AND invoice_number LIKE 'FV/2026/08/%'
     AND split_part(invoice_number, '/', 4) ~ '^[0-9]+$';

  v_nast := public.get_next_invoice_number(v_user, 2026, 8);

  IF v_nast <> v_max + 1 THEN
    RAISE EXCEPTION 'kontrola: licznik zwrócił %, a największy czysty numer to % (spodziewane %)',
      v_nast, v_max, v_max + 1;
  END IF;

  -- 2. KONTROLA ODWROTNA: licznik nadal LICZY skasowane wiersze z czystym
  --    numerem. Zasada „numer raz wystawiony nie wraca" ma zostać nietknięta.
  IF EXISTS (
    SELECT 1 FROM public.user_invoices
     WHERE user_id = v_user AND invoice_number LIKE 'FV/2026/08/%'
       AND split_part(invoice_number, '/', 4) ~ '^[0-9]+$'
       AND deleted_at IS NOT NULL
       AND split_part(invoice_number, '/', 4)::int = v_max
  ) THEN
    RAISE NOTICE 'Największy numer w serii należy do faktury SKASOWANEJ i nadal jest liczony — zasada zachowana.';
  END IF;

  RAISE NOTICE 'Licznik naprawiony: FV/2026/08 → %, było 73.', v_nast;
END;
$kontrola$;

COMMIT;

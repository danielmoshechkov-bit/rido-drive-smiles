-- Falstart faktury FV/2026/02/001 wycofany — jedna z DWÓCH par aktywnych duplikatów.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO TU JEST
-- ═══════════════════════════════════════════════════════════════════════════
-- Po `20260910104210` (wycofanie numerów ze SKASOWANYCH faktur) zostały DWIE
-- pary, w których obie faktury są AKTYWNE. Migracja rozstrzyga JEDNĄ z nich —
-- tę na koncie właściciela platformy. Druga (`iwa4155@wp.pl`) zostaje
-- nietknięta, bo to nie jest nasze konto i nie znamy zamiaru wystawcy.
--
-- Stan zmierzony 10.09.2026 na koncie daniel.moshechkov@gmail.com:
--
--   FV/2026/02/001   12.02 11:53   brutto     0,00   1 pozycja   ← falstart
--   FV/2026/02/001   12.02 12:05   brutto 3 313,80   3 pozycje   ← dokument
--
-- Dwanaście minut różnicy, zerowa kwota i jedna pusta pozycja: to jest
-- niedokończone wystawienie, nie drugi dokument. Kasujemy MIĘKKO — nie
-- fizycznie — bo dokument sprzedaży nie znika z ksiąg, tylko przestaje być
-- czynny.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO OD RAZU SUFIKS, A NIE SAMO `deleted_at`
-- ═══════════════════════════════════════════════════════════════════════════
-- Samo miękkie skasowanie nie wystarczy, żeby dało się później założyć PEŁNY
-- indeks `(user_id, invoice_number)` — indeks liczy WSZYSTKIE wiersze, także
-- skasowane. Dlatego, tak jak w `20260910104210`, wycofany numer dostaje
-- sufiks `-WYCOFANA-1`.
--
-- Numer `FV/2026/02/001` NIE ZOSTAJE ZWOLNIONY: trzyma go dalej prawdziwy
-- dokument z 12:05. A `FV/2026/02/001-WYCOFANA-1` nie pasuje do wzorca serii
-- (`^FV/2026/02/\d+$`), więc `extractSeq` go ignoruje i nie wpływa na
-- liczenie kolejnych numerów.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO TA MIGRACJA NIE ROBI
-- ═══════════════════════════════════════════════════════════════════════════
-- NIE zakłada pełnego indeksu. Po niej zostaje jeszcze para
-- `iwa4155@wp.pl / FV/2026/01/001` — dwa PRAWDZIWE dokumenty na 272,13
-- i 1 490,53. Dopóki jej nie rozstrzygniemy z wystawcą, `20260910111807`
-- odmówi i ma odmawiać.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CO RUSZAMY — wskazane WARUNKIEM, nie identyfikatorem wklejonym z ekranu
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE falstart ON COMMIT DROP AS
SELECT i.id, i.invoice_number, i.gross_total, i.created_at
FROM public.user_invoices i
JOIN auth.users u ON u.id = i.user_id
WHERE u.email = 'daniel.moshechkov@gmail.com'
  AND i.invoice_number = 'FV/2026/02/001'
  AND i.deleted_at IS NULL
  AND coalesce(i.gross_total, 0) = 0;

DO $KONTROLA$
DECLARE
  v_falstartow int;
  v_aktywnych  int;
  v_prawdziwa  numeric;
  v_ksef       int;
BEGIN
  SELECT count(*) INTO v_falstartow FROM falstart;
  SELECT count(*) INTO v_aktywnych
  FROM user_invoices i JOIN auth.users u ON u.id = i.user_id
  WHERE u.email = 'daniel.moshechkov@gmail.com'
    AND i.invoice_number = 'FV/2026/02/001' AND i.deleted_at IS NULL;

  -- Ma byc DOKLADNIE tak, jak przy pomiarze: dwie aktywne, z tego jedna zerowa.
  -- Kazdy inny stan znaczy, ze cos sie zmienilo — wtedy STAJEMY.
  IF v_aktywnych <> 2 THEN
    RAISE EXCEPTION 'Aktywnych FV/2026/02/001 jest % zamiast 2 — stan inny niz przy pomiarze, nie ruszam', v_aktywnych;
  END IF;
  IF v_falstartow <> 1 THEN
    RAISE EXCEPTION 'Falstartow (brutto 0) jest % zamiast 1 — nie wiadomo, ktora wycofac', v_falstartow;
  END IF;

  -- Ta, ktora ZOSTAJE, musi byc dokumentem na kwote — inaczej wycofalibysmy
  -- niewlasciwa.
  SELECT i.gross_total INTO v_prawdziwa
  FROM user_invoices i JOIN auth.users u ON u.id = i.user_id
  WHERE u.email = 'daniel.moshechkov@gmail.com'
    AND i.invoice_number = 'FV/2026/02/001' AND i.deleted_at IS NULL
    AND i.id NOT IN (SELECT id FROM falstart);
  IF coalesce(v_prawdziwa, 0) <= 0 THEN
    RAISE EXCEPTION 'Dokument, ktory ma zostac, ma brutto % — to nie jest ten wlasciwy', v_prawdziwa;
  END IF;

  -- Faktura z numerem KSeF jest ZAMROZONA wyzwalaczem
  -- `prevent_ksef_frozen_invoice_update` — nie wolno jej ruszac.
  SELECT count(*) INTO v_ksef FROM user_invoices i JOIN falstart f ON f.id = i.id
  WHERE i.ksef_reference IS NOT NULL;
  IF v_ksef > 0 THEN
    RAISE EXCEPTION 'Falstart ma numer KSeF — jest zamrozony, nie przenumerowuje';
  END IF;

  RAISE NOTICE 'Wycofuje 1 falstart, zostawiam dokument na % brutto.', v_prawdziwa;
END $KONTROLA$;

-- ---------------------------------------------------------------------------
-- 2. WYCOFANIE
-- ---------------------------------------------------------------------------
UPDATE public.user_invoices i
SET deleted_at     = now(),
    invoice_number = i.invoice_number || '-WYCOFANA-1'
FROM falstart f
WHERE i.id = f.id;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_aktywnych int;
  v_wycofana  int;
  v_zostalo   int;
  v_opis      text;
  v_user      uuid;
  v_numer     text := 'KONTROLA/FAL/' || substr(gen_random_uuid()::text, 1, 8);
  v_id        uuid := gen_random_uuid();
BEGIN
  -- (a) Zostal DOKLADNIE JEDEN aktywny FV/2026/02/001.
  SELECT count(*) INTO v_aktywnych
  FROM user_invoices i JOIN auth.users u ON u.id = i.user_id
  WHERE u.email = 'daniel.moshechkov@gmail.com'
    AND i.invoice_number = 'FV/2026/02/001' AND i.deleted_at IS NULL;
  IF v_aktywnych <> 1 THEN
    RAISE EXCEPTION 'Aktywnych FV/2026/02/001 zostalo % zamiast 1', v_aktywnych;
  END IF;

  -- (b) Falstart jest skasowany I przenumerowany — obie rzeczy naraz.
  SELECT count(*) INTO v_wycofana FROM user_invoices
  WHERE invoice_number = 'FV/2026/02/001-WYCOFANA-1' AND deleted_at IS NOT NULL;
  IF v_wycofana <> 1 THEN
    RAISE EXCEPTION 'Falstart nie zostal wycofany poprawnie (znalezionych: %)', v_wycofana;
  END IF;

  -- (c) Mowimy WPROST, co jeszcze blokuje pelny indeks.
  SELECT count(*), string_agg(u.email || ' ' || t.invoice_number, ', ')
    INTO v_zostalo, v_opis
  FROM (
    SELECT user_id, invoice_number FROM user_invoices
    WHERE deleted_at IS NULL
    GROUP BY user_id, invoice_number HAVING count(*) > 1) t
  JOIN auth.users u ON u.id = t.user_id;
  IF v_zostalo > 0 THEN
    RAISE WARNING 'Zostalo % par aktywnych duplikatow: %. Pelny indeks (20260910111807) NADAL nie wejdzie i ma nie wchodzic.', v_zostalo, v_opis;
  ELSE
    RAISE NOTICE 'Aktywnych duplikatow nie ma — pelny indeks 20260910111807 mozna zakladac.';
  END IF;

  -- (d) KONTROLA POZYTYWNA: zwykle wystawienie MA dzialac. Bez niej caly ten
  --     zestaw sprawdzen przeszedlby takze wtedy, gdyby cos zablokowalo zapis.
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  IF v_user IS NOT NULL THEN
    INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
    VALUES (v_id, v_user, v_numer, current_date);
    IF NOT EXISTS (SELECT 1 FROM user_invoices WHERE id = v_id) THEN
      RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie wystawic faktury';
    END IF;
    DELETE FROM user_invoices WHERE id = v_id;
  END IF;
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

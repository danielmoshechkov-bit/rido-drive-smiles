-- Usunięcie czterech śmieciowych encji z `entities`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZAKRES JEST WĘŻSZY, NIŻ ZAPOWIADAŁEM
-- ═══════════════════════════════════════════════════════════════════════════
-- Mówiłem o „sprzątnięciu martwego świata A". Po sprawdzeniu: ten świat NIE
-- JEST martwy. Tabele są puste, ale kod na nich stoi i działa —
-- `invoices` woła 12 plików frontu i 3 funkcje brzegowe, `entities` 15 i 4,
-- a `purchase_invoices` (597 wierszy, strona zakupowa KSeF) wskazuje na
-- `entities` więzem obcym. Pusta tabela to nie to samo co nieużywana.
--
-- Dlatego NIE kasujemy żadnej tabeli. Zostają cztery encje-śmieci.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO KASUJEMY I DLACZEGO TO BEZPIECZNE
-- ═══════════════════════════════════════════════════════════════════════════
-- Cztery wiersze z nazwami po klawiaturze, założone 24–25 stycznia 2026
-- przez jedno konto. Sprawdzone dynamicznie po WSZYSTKICH więzach obcych
-- wskazujących na `entities` (dziś 21 tabel): żaden wiersz nigdzie na nie
-- nie wskazuje.
--
-- Kontrola poniżej powtarza to skanowanie w chwili wykonania, a nie ufa
-- mojemu sprawdzeniu sprzed godziny. Gdyby cokolwiek zdążyło się dowiązać,
-- migracja stanie.
--
-- Kopia pełnych wierszy trafia do `encje_smieciowe_kopia` — jsonb, więc
-- przetrwa każdą przyszłą zmianę kolumn w `entities`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.encje_smieciowe_kopia (
  id           uuid PRIMARY KEY,
  wiersz       jsonb NOT NULL,
  usunieta_o   timestamptz NOT NULL DEFAULT now()
);

-- Tabela techniczna: nikt z zewnątrz nie ma prawa jej czytać ani pisać.
ALTER TABLE public.encje_smieciowe_kopia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.encje_smieciowe_kopia FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE cele_encje ON COMMIT DROP AS
SELECT id, name FROM entities WHERE id IN (
  '7c0bb5c6-76c4-431c-8fe5-6fe8a79aa5b1',  -- rdsffsd,    2026-01-24
  'e87c92e7-0a95-4234-8718-f7f78e66317e',  -- asdadasdad, 2026-01-25
  '51943ff9-1410-4879-a523-ff0c40c84bc0',  -- asdasd,     2026-01-25
  'ef901544-32af-4426-bee1-df9dc3acf943'   -- asdasdasd,  2026-01-25
);

DO $KONTROLA$
DECLARE
  r      record;
  v_ile  bigint;
  v_cele uuid[];
  v_nazwy text;
BEGIN
  SELECT array_agg(id), string_agg(name, ', ') INTO v_cele, v_nazwy FROM cele_encje;

  -- Po identyfikatorach, ale nazwy muszą się zgadzać. Sam identyfikator nie
  -- powie mi, że wskazałem nie ten wiersz; nazwa powie od razu.
  IF coalesce(array_length(v_cele, 1), 0) <> 4 THEN
    RAISE EXCEPTION 'Spodziewałem się 4 encji, znalazłem %. Nie kasuję w ciemno.',
      coalesce(array_length(v_cele, 1), 0);
  END IF;

  IF EXISTS (SELECT 1 FROM cele_encje
             WHERE name NOT IN ('rdsffsd', 'asdadasdad', 'asdasd', 'asdasdasd')) THEN
    RAISE EXCEPTION 'Identyfikatory wskazują inne encje niż te cztery: %', v_nazwy;
  END IF;

  -- SKANOWANIE DYNAMICZNE. Lista tabel wskazujących na `entities` zmienia się
  -- z każdą migracją, więc czytamy ją z katalogu systemowego zamiast wypisywać
  -- z pamięci — wypisana zestarzeje się przy pierwszej nowej tabeli.
  FOR r IN
    SELECT src.relname AS tabela, att.attname AS kolumna
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid AND tgt.relname = 'entities'
    JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = ANY($1)', r.tabela, r.kolumna)
      INTO v_ile USING v_cele;
    IF v_ile > 0 THEN
      RAISE EXCEPTION 'Coś na nie wskazuje: %.% ma % wierszy — nie kasuję',
        r.tabela, r.kolumna, v_ile;
    END IF;
  END LOOP;
END $KONTROLA$;

INSERT INTO public.encje_smieciowe_kopia (id, wiersz)
SELECT e.id, to_jsonb(e) FROM entities e JOIN cele_encje c ON c.id = e.id
ON CONFLICT (id) DO NOTHING;

DELETE FROM entities e USING cele_encje c WHERE e.id = c.id;

DO $KONIEC$
DECLARE v_zostalo int; v_kopii int;
BEGIN
  SELECT count(*) INTO v_zostalo FROM entities
   WHERE name IN ('rdsffsd', 'asdadasdad', 'asdasd', 'asdasdasd');
  SELECT count(*) INTO v_kopii FROM public.encje_smieciowe_kopia;

  IF v_zostalo <> 0 THEN
    RAISE EXCEPTION 'Zostało % śmieciowych encji', v_zostalo;
  END IF;
  IF v_kopii < 4 THEN
    RAISE EXCEPTION 'Kopia ma % wierszy zamiast 4 — nie ma z czego cofnąć', v_kopii;
  END IF;

  RAISE NOTICE 'Usunięte 4 encje, kopia w encje_smieciowe_kopia (% wierszy).', v_kopii;
END $KONIEC$;

COMMIT;

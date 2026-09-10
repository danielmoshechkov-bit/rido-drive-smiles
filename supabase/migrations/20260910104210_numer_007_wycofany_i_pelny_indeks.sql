-- GR/2026/007: skasowany wiersz dostaje numer spoza serii, indeks staje się pełny.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DECYZJA (10.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Numer `GR/2026/007` mają dwa wiersze: skasowany (AUTO-SERWIS HAWRYLUK, 09:51)
-- i aktywny (CART78GARAGE, 12:58). Numer ZOSTAJE PRZY AKTYWNYM.
--
-- Skasowany wiersz przenumerowujemy, bo:
--   • to konto testowe i nikt tej faktury nie dostał — nie ma czyjej historii
--     przepisywać,
--   • bez tego nie da się założyć PEŁNEGO indeksu unikalnego, a warstwa
--     zależna wyłącznie od wyzwalacza jest słabsza: wyzwalacz da się wyłączyć
--     (`ALTER TABLE ... DISABLE TRIGGER`, `session_replication_role`), indeks nie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO NUMER SPOZA SERII, A NIE KOLEJNY WOLNY
-- ═══════════════════════════════════════════════════════════════════════════
-- `GR/2026/007-WYCOFANA` nie pasuje do wzorca serii (`^GR/2026/\d+$`), więc:
--   • `extractSeq` go IGNORUJE i nie wpływa na liczenie kolejnych numerów,
--   • widać na pierwszy rzut oka, że to dokument wycofany, a nie zwykła faktura.
-- Nadanie mu kolejnego wolnego numeru byłoby gorsze: dokument skasowany
-- zająłby numer, który należy się następnej prawdziwej sprzedaży.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRZENUMEROWANIE — wyłącznie wiersz SKASOWANY
-- ---------------------------------------------------------------------------
-- Warunek celowo wąski: `deleted_at IS NOT NULL`. Gdyby kiedyś ktoś uruchomił
-- tę migrację przy innym stanie, aktywna faktura CART78GARAGE zostaje nietknięta.
UPDATE public.user_invoices
SET invoice_number = invoice_number || '-WYCOFANA'
WHERE invoice_number = 'GR/2026/007'
  AND deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. PEŁNY INDEKS UNIKALNY
-- ---------------------------------------------------------------------------
-- Dotąd unikalność obejmowała wyłącznie wiersze aktywne, bo kolizja nie
-- pozwalała założyć pełnego. Teraz numer nie może się powtórzyć NIGDY —
-- także po skasowaniu dokumentu. To ten sam warunek, którego pilnuje
-- wyzwalacz `prevent_duplicate_invoice_number`; dwie warstwy zamiast jednej.
CREATE UNIQUE INDEX IF NOT EXISTS user_invoices_numer_nigdy_nie_wraca
  ON public.user_invoices (user_id, invoice_number);

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_user  uuid;
  v_numer text := 'KONTROLA/PELNY/' || substr(gen_random_uuid()::text, 1, 8);
  v_id1   uuid := gen_random_uuid();
  v_id2   uuid := gen_random_uuid();
  v_udalo boolean;
  v_akt   int;
  v_wyc   int;
  v_unik  boolean;
  v_czesc boolean;
BEGIN
  -- (a) Kolizji nie ma, a właściwe dokumenty zostały na miejscu.
  SELECT count(*) INTO v_akt FROM user_invoices
  WHERE invoice_number = 'GR/2026/007' AND deleted_at IS NULL;
  SELECT count(*) INTO v_wyc FROM user_invoices
  WHERE invoice_number = 'GR/2026/007-WYCOFANA';

  IF v_akt <> 1 THEN
    RAISE EXCEPTION 'Pod numerem GR/2026/007 jest % aktywnych faktur zamiast jednej', v_akt;
  END IF;
  IF v_wyc <> 1 THEN
    RAISE EXCEPTION 'Nie ma wycofanego wiersza GR/2026/007-WYCOFANA (znalazlem %)', v_wyc;
  END IF;

  -- (b) Indeks jest UNIKALNY i PEŁNY — bez warunku częściowego.
  SELECT indisunique, indpred IS NOT NULL INTO v_unik, v_czesc
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'user_invoices_numer_nigdy_nie_wraca';
  IF v_unik IS NOT TRUE THEN
    RAISE EXCEPTION 'Indeks user_invoices_numer_nigdy_nie_wraca nie jest unikalny';
  END IF;
  IF v_czesc THEN
    RAISE EXCEPTION 'Indeks jest CZESCIOWY — a mial obejmowac takze wiersze skasowane';
  END IF;

  -- (c) KONTROLA POZYTYWNA: zwykle wystawienie MA dzialac.
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
  VALUES (v_id1, v_user, v_numer, current_date);
  IF NOT EXISTS (SELECT 1 FROM user_invoices WHERE id = v_id1) THEN
    RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie wystawic faktury';
  END IF;

  -- (d) SEDNO: po skasowaniu numer ma byc zajety — TERAZ TAKZE NA POZIOMIE
  --     INDEKSU, nie tylko wyzwalacza.
  UPDATE user_invoices SET deleted_at = now() WHERE id = v_id1;
  v_udalo := true;
  BEGIN
    INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
    VALUES (v_id2, v_user, v_numer, current_date);
  EXCEPTION WHEN unique_violation THEN v_udalo := false;
  END;
  IF v_udalo THEN
    DELETE FROM user_invoices WHERE id IN (v_id1, v_id2);
    RAISE EXCEPTION 'Numer skasowanej faktury nadal da sie uzyc ponownie';
  END IF;

  DELETE FROM user_invoices WHERE id IN (v_id1, v_id2);

  RAISE NOTICE 'GR/2026/007 zostaje przy aktywnej fakturze, skasowana wycofana, indeks pelny i unikalny.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

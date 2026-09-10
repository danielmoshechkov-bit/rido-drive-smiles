-- Numer faktury raz wystawiony NIE WRACA — nawet po skasowaniu dokumentu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CO SIĘ STAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- 09.09.2026 numer GR/2026/007 dostały DWA dokumenty:
--
--   09:51  GR/2026/007  AUTO-SERWIS HAWRYLUK      → skasowana 12:18
--   12:58  GR/2026/007  CART78GARAGE sp. z o.o.   → aktywna
--
-- Wyzwalacz zadziałał poprawnie i numeracja też — obie pytały o AKTYWNE wiersze
-- (`deleted_at IS NULL`). Skasowanie pierwszej faktury po prostu zwolniło numer.
--
-- Reguła była zła, nie kod. Klient mógł już dostać dokument, a księgowa go
-- zaksięgować; dwie faktury o jednym numerze u dwóch nabywców to problem przy
-- kontroli. Numer wystawiony jest ZUŻYTY, a skasowanie zostawia lukę i tak ma być.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUNEK W KODZIE I WIĘZ W BAZIE MÓWIĄ TO SAMO
-- ═══════════════════════════════════════════════════════════════════════════
-- Zmiana samego wyzwalacza przeniosłaby błąd w gorsze miejsce: propozycja
-- numeru dalej dawałaby zajęty numer, a wyzwalacz by go odrzucał — klient
-- dostawałby odmowę zapisu przy każdej fakturze po skasowanej. Dlatego w tym
-- samym wdrożeniu zmieniają się WSZYSTKIE SIEDEM miejsc liczących numer:
--
--   • `_shared/invoiceNumbering.ts`  — nagłówek i nazwa parametru (`uzyteSeqs`)
--   • `billing-invoice-issue`        — zapytanie o zajęte numery
--   • `SimpleFreeInvoice`            — propozycja numeru
--   • `SimpleFreeInvoice`            — ostrzeżenie o pominięciu i chronologii
--   • `SimpleFreeInvoice`            — ostrzeżenie „numer zajęty" w kreatorze
--   • `SimpleFreeInvoice`            — kontrola duplikatu przy edycji i zapisie
--   • `SimpleFreeInvoice`            — numeracja KOREKT (miała tę samą usterkę)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ISTNIEJĄCA KOLIZJA ZOSTAJE — ŚWIADOMIE
-- ═══════════════════════════════════════════════════════════════════════════
-- Migracja NIE przenumerowuje żadnej z dwóch faktur GR/2026/007. Który
-- dokument zachowuje numer, to decyzja księgowa, nie techniczna: jeden z nich
-- mógł już trafić do klienta. Dlatego indeks unikalny obejmuje na razie
-- WYŁĄCZNIE wiersze aktywne (`deleted_at IS NULL`) — dziś taki jest jeden,
-- więc indeks powstanie. Pełny indeks bez tego warunku wejdzie osobną migracją,
-- gdy kolizja zostanie rozstrzygnięta. Kontrola niżej wypisuje ją przy każdym
-- przebiegu, żeby nie dało się o niej zapomnieć.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. WYZWALACZ: numer użyty KIEDYKOLWIEK jest zajęty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_duplicate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- ⬇ ZNIKNĄŁ WARUNEK `NEW.deleted_at IS NOT NULL → przepuść`.
  -- Kasowanie faktury to UPDATE ustawiający `deleted_at`; stary warunek
  -- przepuszczał go bez sprawdzenia i to jest w porządku — ale przy okazji
  -- przepuszczał też wstawienie wiersza od razu skasowanego z zajętym numerem.
  -- Teraz sprawdzamy zawsze, a kasowanie i tak przechodzi niżej, bo numer
  -- porównujemy z OLD.
  IF TG_OP = 'UPDATE' AND NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number THEN
    RETURN NEW;   -- numer bez zmian: ten wiersz nie wprowadza nowej kolizji
  END IF;

  -- ⬇ ZNIKNĄŁ `AND deleted_at IS NULL`. To jest cała poprawka:
  -- numer skasowanej faktury pozostaje ZAJĘTY.
  IF EXISTS (
    SELECT 1 FROM public.user_invoices
    WHERE user_id = NEW.user_id
      AND invoice_number = NEW.invoice_number
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION
      'Numer % byl juz uzyty na tym koncie (takze jesli tamta faktura zostala skasowana). Numer raz wystawiony nie wraca.',
      NEW.invoice_number
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. WIĘZ W BAZIE: dwa AKTYWNE dokumenty o jednym numerze — nigdy
-- ---------------------------------------------------------------------------
-- `idx_user_invoices_number_active` istniał, ale NIE BYŁ UNIKALNY — jedyną
-- ochroną był wyzwalacz. Wyzwalacz da się obejść (`ALTER TABLE ... DISABLE
-- TRIGGER`, zapis z `session_replication_role`), indeks nie.
DROP INDEX IF EXISTS public.idx_user_invoices_number_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invoices_number_active
  ON public.user_invoices (user_id, invoice_number)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM, NIE ODCZYTEM TREŚCI FUNKCJI
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_user  uuid;
  v_id1   uuid := gen_random_uuid();
  v_id2   uuid := gen_random_uuid();
  v_numer text := 'KONTROLA/MIGRACJI/' || substr(gen_random_uuid()::text, 1, 8);
  v_udalo boolean;
  v_kolizje text;
  v_unik  boolean;
BEGIN
  -- Konto platformowe jako podkład: wyzwalacz porównuje po `user_id`.
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Brak platform_invoice_user_id — nie mam na czym sprawdzic zachowania';
  END IF;

  -- (a) KONTROLA POZYTYWNA: pierwszy zapis MA się udać. Bez niej cały test
  --     przechodziłby także wtedy, gdyby wyzwalacz odrzucał wszystko.
  INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
  VALUES (v_id1, v_user, v_numer, current_date);
  IF NOT EXISTS (SELECT 1 FROM user_invoices WHERE id = v_id1) THEN
    RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie wystawic pierwszej faktury';
  END IF;

  -- (b) Kasujemy ją miękko — dokładnie tak, jak zrobiono z GR/2026/007.
  UPDATE user_invoices SET deleted_at = now() WHERE id = v_id1;

  -- (c) SEDNO: numer skasowanej faktury MA BYĆ ZAJĘTY.
  v_udalo := true;
  BEGIN
    INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
    VALUES (v_id2, v_user, v_numer, current_date);
  EXCEPTION WHEN unique_violation THEN
    v_udalo := false;
  END;

  IF v_udalo THEN
    DELETE FROM user_invoices WHERE id IN (v_id1, v_id2);
    RAISE EXCEPTION 'Numer skasowanej faktury nadal da sie uzyc ponownie — poprawka nie dziala';
  END IF;

  DELETE FROM user_invoices WHERE id IN (v_id1, v_id2);

  -- (d) Indeks naprawdę jest UNIKALNY, nie tylko obecny.
  SELECT indisunique INTO v_unik
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'idx_user_invoices_number_active';
  IF v_unik IS NOT TRUE THEN
    RAISE EXCEPTION 'idx_user_invoices_number_active istnieje, ale nie jest unikalny';
  END IF;

  -- (e) Istniejące kolizje wypisujemy GŁOŚNO przy każdym przebiegu. Nie jest
  --     to błąd migracji — jest to dług, o którym nie wolno zapomnieć.
  SELECT string_agg(invoice_number || ' (' || ile || ' szt.)', ', ') INTO v_kolizje
  FROM (
    SELECT invoice_number, count(*) AS ile
    FROM user_invoices
    GROUP BY user_id, invoice_number
    HAVING count(*) > 1
  ) t;
  IF v_kolizje IS NOT NULL THEN
    RAISE WARNING 'DO ROZSTRZYGNIECIA: numery uzyte wiecej niz raz — %. Ktory dokument zachowuje numer, to decyzja ksiegowa.', v_kolizje;
  END IF;

  RAISE NOTICE 'Numer raz wystawiony nie wraca: sprawdzone zapisem, indeks unikalny.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

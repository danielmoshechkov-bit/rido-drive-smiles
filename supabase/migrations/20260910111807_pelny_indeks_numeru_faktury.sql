-- Pełny indeks unikalny na numerze faktury — WEJDZIE DOPIERO PO DECYZJI.
--
-- ⚠️ NIE URUCHAMIAJ, dopóki nie znikną dwie ostatnie kolizje: grupy po DWIE
-- AKTYWNE faktury o tym samym numerze u jednego wystawcy. Migracja sprawdza to
-- pierwsza i odmawia z listą, zamiast padać na niezrozumiałym błędzie indeksu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO, SKORO JEST WYZWALACZ
-- ═══════════════════════════════════════════════════════════════════════════
-- `prevent_duplicate_invoice_number` pilnuje tej samej zasady, ale wyzwalacz
-- da się wyłączyć (`ALTER TABLE ... DISABLE TRIGGER`, `session_replication_role`
-- przy odtwarzaniu kopii albo imporcie). Indeks nie da się obejść.
--
-- Dwie warstwy zamiast jednej — to samo rozstrzygnięcie co przy
-- `idx_user_invoices_number_active`, który do 09.09.2026 NIE BYŁ unikalny,
-- choć wszyscy zakładali, że jest.

BEGIN;

DO $KONTROLA$
DECLARE
  v_ile  int;
  v_opis text;
BEGIN
  SELECT count(*), string_agg(coalesce(u.email, t.user_id::text) || ' ' || t.invoice_number, ', ')
    INTO v_ile, v_opis
  FROM (
    SELECT user_id, invoice_number
    FROM public.user_invoices
    GROUP BY user_id, invoice_number
    HAVING count(*) > 1
  ) t
  LEFT JOIN auth.users u ON u.id = t.user_id;

  IF v_ile > 0 THEN
    RAISE EXCEPTION
      'Nie zakladam indeksu: % grup nadal ma powtorzony numer — %. Rozstrzygnij je najpierw; indeks i tak by padl, tylko na komunikacie o kluczu.',
      v_ile, v_opis;
  END IF;
END $KONTROLA$;

CREATE UNIQUE INDEX IF NOT EXISTS user_invoices_numer_nigdy_nie_wraca
  ON public.user_invoices (user_id, invoice_number);

DO $KONIEC$
DECLARE
  v_unik  boolean;
  v_czesc boolean;
  v_user  uuid;
  v_numer text := 'KONTROLA/IDX/' || substr(gen_random_uuid()::text, 1, 8);
  v_id1   uuid := gen_random_uuid();
  v_udalo boolean;
BEGIN
  SELECT indisunique, indpred IS NOT NULL INTO v_unik, v_czesc
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'user_invoices_numer_nigdy_nie_wraca';

  IF v_unik IS NOT TRUE THEN
    RAISE EXCEPTION 'Indeks nie jest unikalny';
  END IF;
  IF v_czesc THEN
    RAISE EXCEPTION 'Indeks jest CZESCIOWY — a mial obejmowac takze wiersze skasowane';
  END IF;

  -- KONTROLA POZYTYWNA + SEDNO w jednym przebiegu: wystawienie ma dzialac,
  -- a numer skasowanej faktury ma byc zajety takze wtedy, gdy wyzwalacz
  -- zostanie wylaczony. Dlatego wylaczamy go na czas sprawdzenia.
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Brak platform_invoice_user_id — nie mam na czym sprawdzic zachowania';
  END IF;

  ALTER TABLE public.user_invoices DISABLE TRIGGER trg_unique_invoice_number;

  INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
  VALUES (v_id1, v_user, v_numer, current_date);
  UPDATE user_invoices SET deleted_at = now() WHERE id = v_id1;

  v_udalo := true;
  BEGIN
    INSERT INTO user_invoices (user_id, invoice_number, issue_date)
    VALUES (v_user, v_numer, current_date);
  EXCEPTION WHEN unique_violation THEN v_udalo := false;
  END;

  ALTER TABLE public.user_invoices ENABLE TRIGGER trg_unique_invoice_number;
  DELETE FROM user_invoices WHERE invoice_number = v_numer;

  IF v_udalo THEN
    RAISE EXCEPTION 'Przy WYLACZONYM wyzwalaczu numer skasowanej faktury wrocil — indeks nie chroni';
  END IF;

  RAISE NOTICE 'Pelny indeks zalozony. Numer nie wraca takze przy wylaczonym wyzwalaczu.';
END $KONIEC$;

COMMIT;

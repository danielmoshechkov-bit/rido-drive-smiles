-- Wgranie DWÓCH poprawek, które nigdy nie weszły w życie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CO SIĘ NAPRAWDĘ STAŁO — POPRAWIONA DIAGNOZA
-- ═══════════════════════════════════════════════════════════════════════════
-- Migracja `20260910104210` padła na własnej kontroli końcowej:
--   „Numer skasowanej faktury znowu da sie uzyc — wyzwalacz przestal dzialac"
--
-- Pierwsza diagnoza brzmiała „ktoś nadpisał funkcję". BYŁA BŁĘDNA i mówię to
-- wprost, bo prowadziła w stronę szukania sprawcy zamiast przyczyny.
--
-- Prawdziwa przyczyna, udowodniona uruchomieniem `20260909162228` na kopii
-- odtwarzającej stan produkcji:
--
--   ERROR: could not create unique index "idx_user_invoices_number_active"
--   SZCZEGÓŁY: Key (user_id, invoice_number)=(…, FV/2026/01/001) is duplicated.
--
-- **`20260909162228` NIGDY NIE WESZŁA.** Padała na indeksie unikalnym, bo
-- konto `iwa4155@wp.pl` ma DWIE AKTYWNE faktury `FV/2026/01/001`. Migracja jest
-- w jednej transakcji, więc wycofywało się WSZYSTKO — razem z poprawioną
-- funkcją. Na produkcji został stan sprzed poprawki, identyczny z wersją
-- z `20260714_unique_invoice_numbers.sql`. Nikt niczego nie nadpisał.
--
-- To jest ta klasa błędu, o której mówi CLAUDE.md przy kontrolach: wynik
-- „Success" nie jest dowodem, że zmiana weszła. Dowodem jest sprawdzenie
-- SKUTKU — i tym razem zrobiła to dopiero kontrola w następnej migracji.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLATEGO TA MIGRACJA NIE ZAKŁADA ŻADNEGO INDEKSU
-- ═══════════════════════════════════════════════════════════════════════════
-- Indeks unikalny — także ten CZĘŚCIOWY, na wierszach aktywnych — nie ma prawa
-- powstać, dopóki istnieją dwie pary AKTYWNYCH faktur o tym samym numerze.
-- Wpięcie go tutaj powtórzyłoby dokładnie ten sam błąd.
--
-- Kolejność jest więc taka i tylko taka:
--   1. TA MIGRACJA          — same funkcje, nic co może paść na danych
--   2. `20260910104210`     — wycofanie numerów ze SKASOWANYCH faktur
--   3. decyzja o dwóch parach AKTYWNYCH duplikatów
--   4. `20260910111807`     — dopiero wtedy indeksy
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DRUGA POPRAWKA, KTÓREJ TEŻ NIE MA W BAZIE
-- ═══════════════════════════════════════════════════════════════════════════
-- `warsztat_tabele_wprost` na produkcji to wersja z `20260816180000` (26 tabel),
-- a nie z `20260823171351` (29). Poza bramką zapisu zostały przez to
-- `workshop_tire_pricing`, `workshop_tire_reminder_log`
-- i `workshop_tire_storage_settings` — trzy tabele modułu przechowalni opon.
-- Wykryte tym samym porównaniem treści funkcji; wgrywane tutaj przy okazji.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ŻEBY TO SIĘ NIE POWTÓRZYŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- Funkcja brzegowa ma SHA i kontrola zgodności ją porówna. Funkcja w bazie nie
-- ma nic — wgrywa się ją raz i nikt nie wie, czy tam jest. Stąd
-- `scripts/sql-harness/sprawdz_dryf_funkcji.py`: porównuje CIAŁO każdej funkcji
-- w bazie z ostatnią definicją w migracjach. To ona pokazała obie te rozbieżności.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. NUMER FAKTURY NIE WRACA (przywrócenie z 20260909162228)
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

  IF TG_OP = 'UPDATE' AND NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number THEN
    RETURN NEW;   -- numer bez zmian: ten wiersz nie wprowadza nowej kolizji
  END IF;

  -- BEZ `AND deleted_at IS NULL` — numer skasowanej faktury pozostaje ZAJĘTY.
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

-- ŻADNEGO INDEKSU TUTAJ — patrz nagłówek. Dwie pary aktywnych duplikatów
-- sprawiają, że nawet indeks częściowy by nie powstał, a cała migracja
-- wycofałaby się razem z funkcjami. Indeksy wchodzą w `20260910111807`.

-- ---------------------------------------------------------------------------
-- 2. BRAMKA ZAPISU — 29 TABEL (przywrócenie z 20260823171351)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warsztat_tabele_wprost()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $FUNKCJA$
  SELECT ARRAY[
    'workshop_orders', 'workshop_clients', 'workshop_vehicles',
    'workshop_cash_closures', 'workshop_expenses', 'workshop_recurring_costs',
    'workshop_finance_settings', 'workshop_payments',
    'workshop_employees', 'workshop_employee_invitations',
    'workshop_employee_findings', 'workshop_employee_notifications',
    'workshop_employee_payouts', 'workshop_mechanics',
    'workshop_stations', 'workshop_station_employees', 'workshop_workstations',
    'workshop_service_points', 'workshop_tire_storage',
    'workshop_order_assignments', 'workshop_order_statuses',
    'workshop_status_settings', 'workshop_order_sequences',
    'workshop_parts_integrations', 'workshop_parts_orders',
    'workshop_calendar_settings',
    'workshop_tire_pricing', 'workshop_tire_reminder_log',
    'workshop_tire_storage_settings'
  ];
$FUNKCJA$;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM, NIE ODCZYTEM TREŚCI
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_user  uuid;
  v_numer text := 'KONTROLA/PRZYWR/' || substr(gen_random_uuid()::text, 1, 8);
  v_id1   uuid := gen_random_uuid();
  v_udalo boolean;
  v_lista text[];
  v_akt   int;
  v_opis  text;
BEGIN
  SELECT platform_invoice_user_id INTO v_user FROM billing_settings WHERE id = true;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Brak platform_invoice_user_id — nie mam na czym sprawdzic zachowania';
  END IF;

  -- (a) KONTROLA POZYTYWNA: zwykle wystawienie MA dzialac.
  INSERT INTO user_invoices (id, user_id, invoice_number, issue_date)
  VALUES (v_id1, v_user, v_numer, current_date);
  IF NOT EXISTS (SELECT 1 FROM user_invoices WHERE id = v_id1) THEN
    RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie wystawic faktury';
  END IF;

  -- (b) SEDNO: po skasowaniu numer ma byc ZAJETY.
  UPDATE user_invoices SET deleted_at = now() WHERE id = v_id1;
  v_udalo := true;
  BEGIN
    INSERT INTO user_invoices (user_id, invoice_number, issue_date)
    VALUES (v_user, v_numer, current_date);
  EXCEPTION WHEN unique_violation THEN v_udalo := false;
  END;
  DELETE FROM user_invoices WHERE invoice_number = v_numer;
  IF v_udalo THEN
    RAISE EXCEPTION 'Numer skasowanej faktury nadal wraca — przywrocenie nie zadzialalo';
  END IF;

  -- (c) Co blokuje indeksy — wypisane, zeby nie zginelo miedzy migracjami.
  SELECT count(*), string_agg(coalesce(u.email, t.user_id::text) || ' ' || t.invoice_number, ', ')
    INTO v_akt, v_opis
  FROM (SELECT user_id, invoice_number FROM user_invoices WHERE deleted_at IS NULL
        GROUP BY user_id, invoice_number HAVING count(*) > 1) t
  LEFT JOIN auth.users u ON u.id = t.user_id;
  IF v_akt > 0 THEN
    RAISE WARNING 'Indeksy czekaja na decyzje: % par AKTYWNYCH duplikatow — %.', v_akt, v_opis;
  END IF;

  -- (d) Bramka zapisu obejmuje 29 tabel, w tym trzy z przechowalni.
  v_lista := public.warsztat_tabele_wprost();
  IF array_length(v_lista, 1) <> 29 THEN
    RAISE EXCEPTION 'Bramka ma % tabel zamiast 29', array_length(v_lista, 1);
  END IF;
  IF NOT (v_lista @> ARRAY['workshop_tire_pricing', 'workshop_tire_reminder_log',
                           'workshop_tire_storage_settings']) THEN
    RAISE EXCEPTION 'Tabele przechowalni nadal poza bramka zapisu';
  END IF;

  RAISE NOTICE 'Wgrane: wyzwalacz numeru (numer nie wraca) i bramka zapisu na 29 tabel. Indeksy osobno.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

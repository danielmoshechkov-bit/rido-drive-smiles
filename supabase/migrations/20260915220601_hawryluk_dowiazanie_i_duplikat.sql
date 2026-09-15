-- ═══════════════════════════════════════════════════════════════════════════
-- HAWRYLUK: DOWIĄZANIE MARCINA + USUNIĘCIE WIERSZA ZDUBLOWANEGO PRZEZ USTERKĘ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mechanizm z migracji `…_powiazanie_pracownika_po_zalogowaniu` dopasowuje po
-- POTWIERDZONYM adresie konta albo po potwierdzonym numerze. Marcin nie ma ani
-- jednego, ani drugiego po stronie konta:
--
--   konto  dopebimmer@gmail.com (11.09.2026), auth.phone puste,
--          `raw_user_meta_data` bez telefonu, `marketplace_user_profiles.phone` puste
--   wiersz „Marcin Ogrzyński" (AUTO-SERWIS HAWRYLUK), email NULL, telefon 530890466
--
-- Numer ma pracodawca, konto ma adres — i nic ich nie łączy poza nazwiskiem.
-- Automat po nazwisku dopasowywać NIE BĘDZIE (dwóch Kowalskich w dwóch
-- warsztatach to nie jest hipotetyczny przypadek), więc to jedno powiązanie
-- robimy ręcznie, na podstawie ustalenia z właścicielem.
--
-- Pozostali dwaj pracownicy HAWRYLUKA („Mateusz Graczyk", „Pracownik") zostają
-- jak są — dowiążą się sami przy pierwszym logowaniu, gdy mechanizm zadziała.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WIERSZ „Pracownik" (86ba5ed9…) — USUWANY, ZA ZGODĄ WŁAŚCICIELA
-- ═══════════════════════════════════════════════════════════════════════════
-- Powstał przez usterkę, nie przez czyjąś pracę. Ciąg znaczników czasu:
--
--   18:32:53  pracodawca dodaje ręcznie „Marcin Ogrzyński", telefon 530890466
--   18:32:55  wysyła zaproszenie SMS-em na ten numer
--   18:35:24  ktoś klika link → stara funkcja szuka pracownika po ADRESIE
--             (pustym, bo zaproszenie jest SMS-owe), nie znajduje i zakłada
--             DRUGI wiersz: „Pracownik", bez adresu i bez numeru
--             ← ten sam znacznik czasu co `accepted_at` zaproszenia
--
-- Pracodawca widzi trzech pracowników, mając dwóch. Przyczyna jest już
-- usunięta (dopasowanie po numerze Z ZAPROSZENIA, czyli po tym, co wpisał
-- pracodawca), został sam wiersz.
--
-- Przed usunięciem przemiot po WSZYSTKICH kolumnach `uuid` w schemacie
-- `public` oraz po kolumnach tekstowych i `jsonb` w tabelach `workshop%`:
-- 1739 kolumn, jedyne wskazanie to sam wiersz. Kontrola pozytywna przemiotu:
-- ta sama pętla puszczona na identyfikator warsztatu HAWRYLUK znajduje 25
-- tabel, więc metoda wykrywa powiązania, gdy istnieją.
--
-- Przemiot powtarza się NIŻEJ, w tej migracji: jeśli cokolwiek zdążyło
-- wskazać na ten wiersz między rozpoznaniem a wykonaniem, migracja odmawia
-- zamiast kasować.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_emp  uuid := 'aef236d2-69c6-4f7a-9c52-2d3986349004';
  v_n    integer;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = 'dopebimmer@gmail.com';
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Nie ma konta dopebimmer@gmail.com — nie ma czego dowiązać.';
  END IF;

  -- Kontrola wstępna: wiersz ma istnieć, być nieprzypisany i należeć do HAWRYLUKA.
  SELECT count(*) INTO v_n
  FROM workshop_employees we
  JOIN service_providers sp ON sp.id = we.provider_id
  WHERE we.id = v_emp AND we.user_id IS NULL AND sp.company_name ILIKE '%hawryluk%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Wiersz pracownika nie jest w stanie opisanym w nagłówku (znaleziono %). Zatrzymuję.', v_n;
  END IF;

  UPDATE workshop_employees
     SET user_id = v_user,
         email   = COALESCE(email, 'dopebimmer@gmail.com'),
         status  = 'active',
         is_active = true,
         removed_at = NULL
   WHERE id = v_emp;

  -- Kontrola po zmianie: dokładnie jeden wiersz i dokładnie to konto.
  SELECT count(*) INTO v_n FROM workshop_employees WHERE id = v_emp AND user_id = v_user;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Dowiązanie nie doszło do skutku.';
  END IF;

  -- Kontrola odwrotna: nie ruszyliśmy nikogo innego.
  SELECT count(*) INTO v_n FROM workshop_employees WHERE user_id = v_user;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'To konto jest teraz przypisane do % wierszy pracownika — oczekiwano jednego.', v_n;
  END IF;

  RAISE NOTICE '✅ Marcin Ogrzyński dowiązany do konta dopebimmer@gmail.com.';
END $$;

-- ── USUNIĘCIE WIERSZA „Pracownik" ─────────────────────────────────────────
DO $$
DECLARE
  v_dup uuid := '86ba5ed9-e282-4d39-874f-77dd96776c6b';
  r record; v_n bigint; v_wskazan text := ''; v_kolumn int := 0;
BEGIN
  -- Kontrola wstępna 1: wiersz ma być pusty i nieprzypisany. Gdyby ktoś zdążył
  -- go uzupełnić albo dowiązać, znaczy to, że przestał być śmieciem.
  SELECT count(*) INTO v_n FROM workshop_employees
   WHERE id = v_dup AND user_id IS NULL AND email IS NULL AND phone IS NULL AND name = 'Pracownik';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Wiersz 86ba5ed9… nie jest już pustym duplikatem (znaleziono %). Nie kasuję.', v_n;
  END IF;

  -- Kontrola wstępna 2: nic nie ma prawa na niego wskazywać. Cztery klucze obce
  -- zatrzymałyby DELETE same, ale kolumny `employee_id` w `service_bookings`,
  -- `service_calendar_blocks` i `service_working_hours` klucza NIE MAJĄ —
  -- tam skasowanie przeszłoby i zostawiło wskazanie w próżnię.
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN pg_class p ON p.relname = c.table_name AND p.relnamespace = 'public'::regnamespace AND p.relkind='r'
    WHERE c.table_schema='public'
      AND ( c.data_type = 'uuid'
         OR (c.data_type IN ('text','jsonb','character varying') AND c.table_name LIKE 'workshop%') )
      AND NOT (c.table_name = 'workshop_employees' AND c.column_name = 'id')
  LOOP
    v_kolumn := v_kolumn + 1;
    IF r.data_type = 'uuid' THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.table_name, r.column_name)
        INTO v_n USING v_dup;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text LIKE $1', r.table_name, r.column_name)
        INTO v_n USING '%' || v_dup::text || '%';
    END IF;
    IF v_n > 0 THEN
      v_wskazan := v_wskazan || E'\n  ' || r.table_name || '.' || r.column_name || ' = ' || v_n;
    END IF;
  END LOOP;

  IF v_wskazan <> '' THEN
    RAISE EXCEPTION 'Na wiersz „Pracownik" coś wskazuje — NIE kasuję. Wskazania: %', v_wskazan;
  END IF;
  IF v_kolumn < 100 THEN
    RAISE EXCEPTION 'Przemiot objął tylko % kolumn — to nie jest sprawdzenie, tylko jego pozór.', v_kolumn;
  END IF;

  DELETE FROM workshop_employees WHERE id = v_dup;

  SELECT count(*) INTO v_n FROM workshop_employees WHERE id = v_dup;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Wiersz nie został usunięty.';
  END IF;

  -- Kontrola odwrotna: pozostali dwaj pracownicy HAWRYLUKA mają zostać.
  SELECT count(*) INTO v_n FROM workshop_employees we
    JOIN service_providers sp ON sp.id = we.provider_id
   WHERE sp.company_name ILIKE '%hawryluk%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Po usunięciu HAWRYLUK ma % pracowników — oczekiwano dwóch.', v_n;
  END IF;

  RAISE NOTICE '✅ Duplikat usunięty (przemiot po % kolumnach, zero wskazań). Zostało dwóch pracowników.', v_kolumn;
END $$;

COMMIT;

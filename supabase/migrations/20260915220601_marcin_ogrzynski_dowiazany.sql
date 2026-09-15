-- ═══════════════════════════════════════════════════════════════════════════
-- DOWIĄZANIE KONTA MARCINA OGRZYŃSKIEGO DO WIERSZA PRACOWNIKA (15.09.2026)
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
-- 🔴 NIE KASUJEMY tu niczego. Wiersz „Pracownik" (86ba5ed9…, bez adresu
-- i bez numeru) to duplikat założony przez starą wersję funkcji przyjmującej
-- zaproszenie w chwili kliknięcia linku (10.09, 18:35:24 — sekunda w sekundę
-- z `accepted_at` zaproszenia). Przyczyna jest usunięta, ale sam wiersz czeka
-- na decyzję właściciela.
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

COMMIT;

-- Ślad wysyłki maila z fakturą + usunięcie martwej flagi KSeF.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CZĘŚĆ 1: NIE DA SIĘ ODPOWIEDZIEĆ, CZY MAIL POSZEDŁ
-- ═══════════════════════════════════════════════════════════════════════════
-- Faktura GR/2026/007 z 09.09 12:58 miała komplet danych: nabywca
-- CART78GARAGE, adres `kontakt@c78g.pl`, `billing_events` przetworzone bez
-- błędu, `invoice-pdf.php` odpowiada w pół sekundy. A mail nie dotarł.
--
-- Ustalenie, DLACZEGO, okazało się niemożliwe: wynik wysyłki szedł wyłącznie
-- do `console.log` funkcji brzegowej. Dziennik jest ulotny i nie da się go
-- odpytać zapytaniem. Reklamacja klienta „nie dostałem faktury" nie ma się
-- o co oprzeć — nie wiadomo nawet, czy próbowaliśmy.
--
-- Dwie kolumny zamykają tę dziurę i przy okazji dają czym PONOWIĆ wysyłkę:
-- `email_sent_at IS NULL` znaczy „ten dokument czeka na maila".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZĘŚĆ 2: `billing_settings.ksef_enabled` NIC NIE PRZEŁĄCZA
-- ═══════════════════════════════════════════════════════════════════════════
-- Kolumna powstała w `20260806100000_billing_schema` i od tamtej pory NIKT jej
-- nie czyta — sprawdzone w `src/`, w `supabase/functions/` i w treści wszystkich
-- funkcji bazodanowych (`pg_proc.prosrc`). Zero trafień.
--
-- Tymczasem panel Centrum Płatności pokazuje „KSeF WŁĄCZONE", a faktury
-- platformy mają `ksef_status = not_sent`. Ktoś, kto szuka przyczyny, trafia
-- na `ksef_enabled = false` i traci godzinę na przełączniku, który niczego nie
-- przełącza. Dokładnie ten scenariusz opisuje STAN-PRAC przy
-- `auto_invoice_on_paid` — tamtą kolumnę usunęła migracja `20260823165643`.
-- Ta idzie tą samą drogą.
--
-- JEDNYM ŹRÓDŁEM PRAWDY dla KSeF faktur platformy zostaje `company_settings`
-- WIERSZA KONTA PLATFORMOWEGO (`billing_settings.platform_invoice_user_id`):
-- para `ksef_send_invoices_enabled` + `ksef_auto_send_enabled`. Powód nie jest
-- dowolny: to jedyne flagi, które cokolwiek czyta (`SimpleFreeInvoice`), i to
-- przy nich leży token (`ksef_token`) oraz środowisko. Trzymanie decyzji z dala
-- od tokenu dałoby stan „włączone, ale nie ma czym wysłać".
--
-- `ksef_settings` NIE jest czwartym miejscem — to konfiguracja PER ENCJA dla
-- `ksef-integration` (moduł księgowy klientów), dziś pusta. Nie ruszamy jej.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ŚLAD WYSYŁKI
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error   text;

COMMENT ON COLUMN public.user_invoices.email_sent_at IS
  'Kiedy mail z fakturą wyszedł NAPRAWDĘ (potwierdzone przez SMTP). NULL = jeszcze nie wyszedł — to jest sygnał dla ponowienia.';
COMMENT ON COLUMN public.user_invoices.email_error IS
  'Powód, dla którego mail nie wyszedł. Kasowany przy udanej wysyłce, żeby nie straszył po naprawie.';

-- Ponowienie szuka faktur bez maila. Bez indeksu przeglądałoby całą tabelę
-- przy każdym przebiegu zadania.
CREATE INDEX IF NOT EXISTS idx_user_invoices_bez_maila
  ON public.user_invoices (created_at)
  WHERE email_sent_at IS NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. STAN ZASTANY: faktury sprzed tej migracji
-- ---------------------------------------------------------------------------
-- Wszystkie mają `email_sent_at IS NULL`, bo kolumna dopiero powstała — a to
-- znaczy „czeka na maila". Ponowienie wysłałoby DRUGI raz dokumenty z sierpnia,
-- które klienci już dostali.
--
-- Dlatego zamykamy przeszłość jawnie: dokumenty starsze niż dzisiejsza sesja
-- dostają znacznik „nie wiemy, stan sprzed śladu". Nie udajemy, że wyszły
-- (bo nie wiemy) — ale i nie każemy ich wysyłać ponownie.
-- CHWILA STARTU zapamiętana JAWNIE. `now()` użyte dwa razy — raz w zapisie,
-- raz w kontroli — dałoby kontrolę, która sprawdza własny `UPDATE` i przez to
-- nie może zawieść. Ten sam znacznik w obu miejscach czyni z niej zdanie
-- o pokryciu: „każda faktura sprzed tej chwili jest zamknięta".
CREATE TEMP TABLE chwila_startu ON COMMIT DROP AS SELECT now() AS o;

UPDATE public.user_invoices
SET email_error = 'stan sprzed wprowadzenia sladu wysylki — nie ponawiamy'
WHERE email_sent_at IS NULL
  AND email_error IS NULL
  AND created_at < (SELECT o FROM chwila_startu);

-- ---------------------------------------------------------------------------
-- 3. MARTWA FLAGA ZNIKA
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_settings DROP COLUMN IF EXISTS ksef_enabled;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_int int;
  v_txt text;
BEGIN
  -- (a) Kolumny naprawdę są i mają właściwy typ.
  SELECT count(*) INTO v_int FROM information_schema.columns
  WHERE table_schema='public' AND table_name='user_invoices'
    AND column_name IN ('email_sent_at','email_error');
  IF v_int <> 2 THEN
    RAISE EXCEPTION 'Brakuje kolumn sladu wysylki (znalazlem %)', v_int;
  END IF;

  -- (b) Martwa flaga naprawdę zniknęła.
  SELECT count(*) INTO v_int FROM information_schema.columns
  WHERE table_schema='public' AND table_name='billing_settings' AND column_name='ksef_enabled';
  IF v_int <> 0 THEN
    RAISE EXCEPTION 'billing_settings.ksef_enabled nadal istnieje';
  END IF;

  -- (c) KONTROLA, KTÓREJ ZABRAKŁO DZIEWIĘĆ RAZY: czy usunięcie kolumny
  --     czegoś nie wywróciło. Pytamy bazę, czy JAKAKOLWIEK funkcja albo widok
  --     nadal się do niej odwołuje — gdyby tak było, padłyby dopiero przy
  --     wywołaniu, czyli u klienta.
  SELECT string_agg(p.proname, ', ') INTO v_txt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosrc ILIKE '%ksef_enabled%';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Funkcje nadal czytaja ksef_enabled: %', v_txt;
  END IF;

  SELECT string_agg(viewname, ', ') INTO v_txt
  FROM pg_views WHERE schemaname='public' AND definition ILIKE '%ksef_enabled%';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'Widoki nadal czytaja ksef_enabled: %', v_txt;
  END IF;

  -- (d) POKRYCIE ZAMKNIĘCIA: żadna faktura sprzed CHWILI STARTU nie została
  --     otwarta. Porównanie idzie do zapamiętanego znacznika, nie do `now()` —
  --     inaczej kontrola pytałaby o zbiór, który sama przed chwilą opróżniła,
  --     i nie mogłaby wypaść czerwono nigdy.
  SELECT count(*) INTO v_int FROM user_invoices
  WHERE email_sent_at IS NULL AND email_error IS NULL AND deleted_at IS NULL
    AND created_at < (SELECT o FROM chwila_startu);
  IF v_int <> 0 THEN
    RAISE EXCEPTION '% faktur sprzed sladu wyglada na czekajace na maila — ponowienie wyslaloby je drugi raz', v_int;
  END IF;

  RAISE NOTICE 'Slad wysylki zalozony, przeszlosc zamknieta, martwa flaga ksef_enabled usunieta.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

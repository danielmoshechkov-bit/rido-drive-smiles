-- Trzecie ogniwo lustra: dane wystawcy platformy trafiają też tam,
-- skąd czyta je FAKTURA.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- STAN ZASTANY
-- ═══════════════════════════════════════════════════════════════════════════
-- Dane firmy żyją w TRZECH tabelach:
--
--   `company_settings`        ← zapisuje kafel Ustawienia w Centrum Płatności
--   `entities`                ← lustro z `company_settings` (migracja 20260823200000)
--   `user_invoice_companies`  ← CZYTA TO FAKTURA, i nic tu nie pisało
--
-- Skutek: zmiana adresu w Ustawieniach nie zmieniała adresu na fakturach.
-- Bez błędu, bez ostrzeżenia. Widać to na danych zastanych — w tabeli faktur
-- nazwa brzmi „Getrido Sp. z o.o." zamiast pełnej formy prawnej, a numer
-- konta jest pusty.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO LUSTRO OBEJMUJE JEDNĄ FIRMĘ, A NIE WSZYSTKIE
-- ═══════════════════════════════════════════════════════════════════════════
-- `user_invoice_companies` trzyma dane sprzedawcy KAŻDEGO warsztatu — to z nich
-- warsztat wystawia faktury swoim klientom. Lustrzane przepisywanie tam
-- `company_settings` wszystkich użytkowników zmieniałoby dane na cudzych
-- fakturach przy okazji naszego problemu.
--
-- Dlatego lustro dotyczy WYŁĄCZNIE firmy wskazanej przez
-- `billing_settings.platform_invoice_company_id`. Jedna firma, ta nasza.
--
-- Ta sama zasada co w istniejącym lustrze: przepisujemy WYŁĄCZNIE kolumny,
-- które właśnie się zmieniły. Nie zgadujemy, która strona ma rację przy
-- rozbieżności zastanej — automat wybrałby źle równie często co dobrze.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Ustawienia → firma wystawiająca
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.synchronizuj_ustawienia_do_wystawcy()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
DECLARE
  v_firma uuid;
BEGIN
  -- Zapis wywołany przez bliźniaczy wyzwalacz — nie odbijamy piłki w kółko.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Konto platformowe rozpoznajemy przez WŁAŚCICIELA wskazanej firmy, a nie
  -- przez `billing_settings.platform_invoice_user_id`. Ta kolumna istnieje
  -- na produkcji, ale zakłada ją migracja z niescalonej gałęzi — żadna
  -- migracja na `main` jej nie tworzy. Opieranie się na niej znaczyłoby, że
  -- odtworzenie bazy z repozytorium daje inny wynik niż produkcja.
  SELECT b.platform_invoice_company_id INTO v_firma
  FROM billing_settings b
  JOIN user_invoice_companies c ON c.id = b.platform_invoice_company_id
  WHERE c.user_id = NEW.user_id
  LIMIT 1;

  -- Nie jesteśmy kontem platformowym — to zwykły warsztat i jego dane
  -- sprzedawcy są jego sprawą.
  IF v_firma IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE user_invoice_companies c SET
    name         = CASE WHEN NEW.company_name IS DISTINCT FROM OLD.company_name THEN NEW.company_name ELSE c.name END,
    nip          = CASE WHEN NEW.nip          IS DISTINCT FROM OLD.nip          THEN NEW.nip          ELSE c.nip END,
    address_street    = CASE WHEN NEW.street  IS DISTINCT FROM OLD.street       THEN NEW.street       ELSE c.address_street END,
    address_city      = CASE WHEN NEW.city    IS DISTINCT FROM OLD.city         THEN NEW.city         ELSE c.address_city END,
    address_postal_code = CASE WHEN NEW.postal_code IS DISTINCT FROM OLD.postal_code THEN NEW.postal_code ELSE c.address_postal_code END,
    email        = CASE WHEN NEW.email        IS DISTINCT FROM OLD.email        THEN NEW.email        ELSE c.email END,
    phone        = CASE WHEN NEW.phone        IS DISTINCT FROM OLD.phone        THEN NEW.phone        ELSE c.phone END,
    bank_name    = CASE WHEN NEW.bank_name    IS DISTINCT FROM OLD.bank_name    THEN NEW.bank_name    ELSE c.bank_name END,
    bank_account = CASE WHEN NEW.bank_account IS DISTINCT FROM OLD.bank_account THEN NEW.bank_account ELSE c.bank_account END,
    vat_exemption_basis = CASE WHEN NEW.vat_exemption_basis IS DISTINCT FROM OLD.vat_exemption_basis THEN NEW.vat_exemption_basis ELSE c.vat_exemption_basis END,
    updated_at   = now()
  WHERE c.id = v_firma;

  RETURN NEW;
END;
$FUNKCJA$;

DROP TRIGGER IF EXISTS trg_ustawienia_do_wystawcy ON public.company_settings;
CREATE TRIGGER trg_ustawienia_do_wystawcy
  AFTER UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.synchronizuj_ustawienia_do_wystawcy();

-- ---------------------------------------------------------------------------
-- 2. Firma wystawiająca → ustawienia
-- ---------------------------------------------------------------------------
-- Kierunek powrotny, bo firmę da się edytować także w module faktur. Bez niego
-- ten sam rozjazd wróciłby drugą drogą — tylko trudniejszy do zauważenia,
-- bo tym razem to KAFEL pokazywałby nieprawdę.
CREATE OR REPLACE FUNCTION public.synchronizuj_wystawce_do_ustawien()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM billing_settings b WHERE b.platform_invoice_company_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE company_settings cs SET
    company_name = CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN NEW.name ELSE cs.company_name END,
    nip          = CASE WHEN NEW.nip  IS DISTINCT FROM OLD.nip  THEN NEW.nip  ELSE cs.nip END,
    street       = CASE WHEN NEW.address_street IS DISTINCT FROM OLD.address_street THEN NEW.address_street ELSE cs.street END,
    city         = CASE WHEN NEW.address_city IS DISTINCT FROM OLD.address_city THEN NEW.address_city ELSE cs.city END,
    postal_code  = CASE WHEN NEW.address_postal_code IS DISTINCT FROM OLD.address_postal_code THEN NEW.address_postal_code ELSE cs.postal_code END,
    email        = CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN NEW.email ELSE cs.email END,
    phone        = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone ELSE cs.phone END,
    bank_name    = CASE WHEN NEW.bank_name IS DISTINCT FROM OLD.bank_name THEN NEW.bank_name ELSE cs.bank_name END,
    bank_account = CASE WHEN NEW.bank_account IS DISTINCT FROM OLD.bank_account THEN NEW.bank_account ELSE cs.bank_account END,
    vat_exemption_basis = CASE WHEN NEW.vat_exemption_basis IS DISTINCT FROM OLD.vat_exemption_basis THEN NEW.vat_exemption_basis ELSE cs.vat_exemption_basis END,
    updated_at   = now()
  WHERE cs.user_id = NEW.user_id;

  RETURN NEW;
END;
$FUNKCJA$;

DROP TRIGGER IF EXISTS trg_wystawca_do_ustawien ON public.user_invoice_companies;
CREATE TRIGGER trg_wystawca_do_ustawien
  AFTER UPDATE ON public.user_invoice_companies
  FOR EACH ROW EXECUTE FUNCTION public.synchronizuj_wystawce_do_ustawien();

-- ---------------------------------------------------------------------------
-- 3. Wyrównanie tego, co już się rozjechało
-- ---------------------------------------------------------------------------
-- Jedyne miejsce, gdzie rozstrzygam rozbieżność ręcznie — bo znam odpowiedź:
-- to są dane podane wprost przez właściciela. Poza tą jedną firmą lustro
-- niczego nie prostuje wstecz.
UPDATE user_invoice_companies c
SET name         = 'GETRIDO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
    bank_account = '38105010251000009087179207',
    updated_at   = now()
FROM billing_settings b
WHERE c.id = b.platform_invoice_company_id;

DO $KONTROLA$
DECLARE v_nazwa text; v_konto text; v_nip text;
BEGIN
  SELECT c.name, c.bank_account, c.nip INTO v_nazwa, v_konto, v_nip
  FROM billing_settings b
  JOIN user_invoice_companies c ON c.id = b.platform_invoice_company_id;

  IF v_nazwa IS NULL THEN
    RAISE EXCEPTION 'Nie ma wskazanej firmy wystawiającej — nie ma czego wyrównywać';
  END IF;
  IF v_konto <> '38105010251000009087179207' THEN
    RAISE EXCEPTION 'Numer konta nie trafił do firmy wystawiającej: %', v_konto;
  END IF;
  IF v_nip <> '5223377431' THEN
    RAISE EXCEPTION 'NIP wystawcy to % — spodziewałem się 5223377431', v_nip;
  END IF;

  -- Oba wyzwalacze muszą WISIEĆ. `CREATE OR REPLACE FUNCTION` samo ich nie zakłada,
  -- a funkcja bez wpięcia niczego nie synchronizuje.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ustawienia_do_wystawcy' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wystawca_do_ustawien' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Wyzwalacze lustra nie są wpięte';
  END IF;

  RAISE NOTICE 'Wystawca: % / NIP % / konto %', v_nazwa, v_nip, v_konto;
END $KONTROLA$;

COMMIT;

NOTIFY pgrst, 'reload schema';

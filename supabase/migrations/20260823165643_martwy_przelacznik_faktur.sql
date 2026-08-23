-- Usunięcie kolumny `billing_settings.auto_invoice_on_paid`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PRZEŁĄCZNIK, KTÓRY NIC NIE PRZEŁĄCZA
-- ═══════════════════════════════════════════════════════════════════════════
-- Kolumna powstała z myślą o bramkowaniu automatycznego fakturowania i stała
-- na `false`. NIC JEJ NIE CZYTAŁO: ani `billing-payu-webhook`, ani
-- `billing-stripe-webhook`, ani front. Sprawdzone `grep`-em po całym
-- repozytorium — jedyne wystąpienie to `CREATE TABLE`, które ją zakłada.
--
-- Skutek był gorszy niż brak kolumny: przy pierwszym pytaniu „dlaczego klient
-- dostał fakturę, skoro fakturowanie jest wyłączone" ktoś sprawdzałby ten
-- przełącznik, zobaczył `false` i szukał błędu tam, gdzie go nie ma.
--
-- Obie metody płatności wystawiają fakturę bezwarunkowo i mają się zachowywać
-- tak samo. Zostawienie jednej za przełącznikiem znaczyłoby, że klient dostaje
-- dokument albo nie w zależności od tego, czym zapłacił.
--
-- ZABEZPIECZENIE ZOSTAJE, tylko z innej strony i mocniejsze: bez kompletu
-- danych nabywcy (`billing_dane_nabywcy_kompletne`) płatność w ogóle nie
-- startuje, więc faktura z pustym nabywcą nie ma jak powstać.

BEGIN;

-- Kontrola PRZED skasowaniem: nic w bazie nie może od niej zależeć. Widok albo
-- funkcja odwołująca się do kolumny padłaby dopiero przy pierwszym wywołaniu,
-- a to zawsze jest ruch klienta, nie nasz.
DO $KONTROLA$
DECLARE v_zaleznosci text;
BEGIN
  SELECT string_agg(DISTINCT c.relname, ', ') INTO v_zaleznosci
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class c ON c.oid = r.ev_class
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE d.refobjid = 'public.billing_settings'::regclass
    AND a.attname = 'auto_invoice_on_paid';

  IF v_zaleznosci IS NOT NULL THEN
    RAISE EXCEPTION 'Od kolumny zależą widoki: % — nie kasuję', v_zaleznosci;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO v_zaleznosci
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prosrc LIKE '%auto_invoice_on_paid%';

  IF v_zaleznosci IS NOT NULL THEN
    RAISE EXCEPTION 'Kolumnę czytają funkcje: % — nie kasuję', v_zaleznosci;
  END IF;
END $KONTROLA$;

ALTER TABLE public.billing_settings DROP COLUMN IF EXISTS auto_invoice_on_paid;

DO $KONIEC$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_settings'
      AND column_name = 'auto_invoice_on_paid'
  ) THEN
    RAISE EXCEPTION 'Kolumna nadal jest';
  END IF;
  RAISE NOTICE 'Martwy przełącznik usunięty. Fakturowanie bramkuje komplet danych nabywcy.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

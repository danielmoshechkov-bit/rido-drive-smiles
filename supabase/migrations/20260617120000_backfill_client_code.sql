-- Warsztat / fix linku do karty klienta: stare zlecenia (sprzed dodania kolumny
-- client_code, migracja 20260215) mają client_code = NULL, przez co link z SMS-a
-- to /warsztat/klient/null → "nie znaleziono zlecenia", niezależnie od odświeżania.
--
-- Backfill: nadaj brakujące kody w tym samym formacie co trigger
-- generate_client_confirmation_code() (6 znaków z alfabetu bez znaków mylących).
-- Pętla powtarza losowanie aż kod będzie unikalny.

DO $$
DECLARE
  r RECORD;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
BEGIN
  FOR r IN SELECT id FROM public.workshop_orders WHERE client_code IS NULL OR client_code = '' LOOP
    LOOP
      code := '';
      FOR i IN 1..6 LOOP
        code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
      END LOOP;
      -- unikalność w obrębie całej tabeli
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workshop_orders WHERE client_code = code);
    END LOOP;
    UPDATE public.workshop_orders SET client_code = code WHERE id = r.id;
  END LOOP;
END $$;

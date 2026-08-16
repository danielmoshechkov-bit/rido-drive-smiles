-- Czy anonim może pisać po czacie wsparcia albo czytać cudze rozmowy.
-- Odtworzony po utracie pliku tymczasowego (16.08). Sprawdza REALNE polityki:
-- wykonujemy zapis jako rola anon i oczekujemy odmowy.
DO $$
DECLARE
  udalo_sie boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.support_conversations (contact_email, contact_name)
    VALUES ('obcy@example.com', 'PROBA NADUZYCIA');
    udalo_sie := true;
  EXCEPTION WHEN others THEN
    udalo_sie := false;
  END;
  RESET ROLE;
  IF udalo_sie THEN
    RAISE EXCEPTION 'anon MOZE zakladac rozmowy — dziura w politykach';
  END IF;
END $$;

SELECT 'zablokowane (dobrze)' AS efekt;

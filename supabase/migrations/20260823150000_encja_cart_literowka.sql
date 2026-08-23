-- Usunięcie encji `cart sp zoo` z literówką w NIP-ie.
--
-- NIP 5222884984 zamiast 5272884984 — prawdziwy CART figuruje pod tym drugim
-- w `user_invoice_companies`. Encja z literówką nie ma nic dowiązanego:
-- ani faktury zakupowej, ani dokumentu, ani transmisji KSeF.
--
-- Kasujemy dokładnie tę jedną, wskazaną PARĄ nazwa + NIP. Sam identyfikator
-- nie powiedziałby, że wskazałem właściwy wiersz; para powie od razu, a przy
-- rozjeździe migracja stanie zamiast skasować cudzą encję.
--
-- Kopia trafia do tej samej tabeli co poprzednio (`encje_smieciowe_kopia`),
-- więc cofnięcie wygląda tak samo.

BEGIN;

CREATE TEMP TABLE cel_cart ON COMMIT DROP AS
SELECT id, name, nip FROM entities WHERE name = 'cart sp zoo' AND nip = '5222884984';

DO $KONTROLA$
DECLARE r record; v_ile bigint; v_cel uuid;
BEGIN
  SELECT id INTO v_cel FROM cel_cart;
  IF v_cel IS NULL THEN
    RAISE EXCEPTION 'Nie ma encji „cart sp zoo" z NIP 5222884984 — nic nie kasuję.';
  END IF;
  IF (SELECT count(*) FROM cel_cart) <> 1 THEN
    RAISE EXCEPTION 'Więcej niż jedna encja pasuje — nie zgaduję, którą.';
  END IF;

  -- To samo skanowanie po katalogu systemowym co przy czterech śmieciach:
  -- lista tabel wskazujących na `entities` rośnie z każdą migracją.
  FOR r IN
    SELECT src.relname AS tabela, att.attname AS kolumna
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid AND tgt.relname = 'entities'
    JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tabela, r.kolumna)
      INTO v_ile USING v_cel;
    IF v_ile > 0 THEN
      RAISE EXCEPTION 'Coś na nią wskazuje: %.% ma % wierszy — nie kasuję',
        r.tabela, r.kolumna, v_ile;
    END IF;
  END LOOP;
END $KONTROLA$;

INSERT INTO public.encje_smieciowe_kopia (id, wiersz)
SELECT e.id, to_jsonb(e) FROM entities e JOIN cel_cart c ON c.id = e.id
ON CONFLICT (id) DO NOTHING;

DELETE FROM entities e USING cel_cart c WHERE e.id = c.id;

DO $KONIEC$
DECLARE v_zostalo int;
BEGIN
  SELECT count(*) INTO v_zostalo FROM entities WHERE name = 'cart sp zoo' AND nip = '5222884984';
  IF v_zostalo <> 0 THEN RAISE EXCEPTION 'Encja nadal jest'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.encje_smieciowe_kopia WHERE wiersz ->> 'nip' = '5222884984') THEN
    RAISE EXCEPTION 'Brak kopii — nie ma z czego cofnąć';
  END IF;
  RAISE NOTICE 'Encja z literówką usunięta, kopia zachowana.';
END $KONIEC$;

COMMIT;

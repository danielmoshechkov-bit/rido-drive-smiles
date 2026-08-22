\set QUIET on
SET client_min_messages = notice;
BEGIN;
-- zlecenia startowe zakladamy jako wlasciciel bazy (omija RLS)
INSERT INTO workshop_orders (id, provider_id, client_id, vehicle_id, order_number, status_name)
VALUES ('ffff0000-0000-0000-0000-000000000001','bbbb0000-0000-0000-0000-000000000001','c1111111-0000-0000-0000-000000000001','a1111111-0000-0000-0000-000000000001','Z/A','Przyjete'),
       ('ffff0000-0000-0000-0000-000000000002','bbbb0000-0000-0000-0000-000000000002','c1111111-0000-0000-0000-000000000001','a1111111-0000-0000-0000-000000000001','Z/B','Przyjete'),
       ('ffff0000-0000-0000-0000-000000000004','bbbb0000-0000-0000-0000-000000000004','c1111111-0000-0000-0000-000000000001','a1111111-0000-0000-0000-000000000001','Z/D','Przyjete');

DO $$
DECLARE v_ok text := ''; v_zle text := ''; n int;

BEGIN
  -- ============ WARSZTAT W TRYBIE DOKONCZENIA (bbbb...0002) ============
  PERFORM set_config('app.uid','aaaa0000-0000-0000-0000-000000000002', true);
  SET LOCAL ROLE authenticated;

  -- 1. nowe zlecenie MA byc odmowione
  BEGIN
    INSERT INTO workshop_orders (provider_id, order_number)
    VALUES ('bbbb0000-0000-0000-0000-000000000002','Z/NOWE');
    v_zle := v_zle || E'\n  BLAD nowe zlecenie PRZESZLO w trybie dokonczenia';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_ok := v_ok || E'\n  OK   tryb dokonczenia: nowe zlecenie odmowione';
  END;

  -- 2. zmiana statusu MA przejsc (liczymy WIERSZE — polityka filtruje, nie rzuca)
  UPDATE workshop_orders SET status_name='Zakonczone'
    WHERE id='ffff0000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN v_ok := v_ok || E'\n  OK   tryb dokonczenia: zmiana statusu przechodzi';
  ELSE v_zle := v_zle || E'\n  BLAD zmiana statusu dotknela ' || n || ' wierszy'; END IF;

  -- 3. dopisanie pozycji MA przejsc
  BEGIN
    INSERT INTO workshop_order_items (order_id) VALUES ('ffff0000-0000-0000-0000-000000000002');
    v_ok := v_ok || E'\n  OK   tryb dokonczenia: dopisanie pozycji przechodzi';
  EXCEPTION WHEN others THEN v_zle := v_zle || E'\n  BLAD pozycja odmowiona: ' || SQLERRM;
  END;

  -- 4. usuniecie zlecenia MA przejsc
  UPDATE workshop_orders SET status_name='x' WHERE id='ffff0000-0000-0000-0000-000000000002';
  DELETE FROM workshop_order_items WHERE order_id='ffff0000-0000-0000-0000-000000000002';
  DELETE FROM workshop_orders WHERE id='ffff0000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN v_ok := v_ok || E'\n  OK   tryb dokonczenia: usuniecie zlecenia przechodzi';
  ELSE v_zle := v_zle || E'\n  BLAD usuniecie dotknelo ' || n || ' wierszy'; END IF;

  -- 5. kartoteka klientow MA byc zamknieta
  BEGIN
    INSERT INTO workshop_clients (provider_id) VALUES ('bbbb0000-0000-0000-0000-000000000002');
    v_zle := v_zle || E'\n  BLAD kartoteka klientow PRZEPUSCILA wpis';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_ok := v_ok || E'\n  OK   tryb dokonczenia: kartoteka klientow zamknieta';
  END;

  -- ============ WARSZTAT Z PELNYM DOSTEPEM (bbbb...0001) ============
  RESET ROLE;
  PERFORM set_config('app.uid','aaaa0000-0000-0000-0000-000000000001', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO workshop_orders (provider_id, order_number)
    VALUES ('bbbb0000-0000-0000-0000-000000000001','Z/OK');
    v_ok := v_ok || E'\n  OK   pelny dostep: nowe zlecenie przechodzi';
  EXCEPTION WHEN others THEN v_zle := v_zle || E'\n  BLAD pelny dostep odmowil nowego zlecenia: ' || SQLERRM;
  END;

  -- ============ TWARDY BLOK (bbbb...0004, brak trialu, dokanczanie minelo) ============
  RESET ROLE;
  PERFORM set_config('app.uid','aaaa0000-0000-0000-0000-000000000004', true);
  SET LOCAL ROLE authenticated;
  UPDATE workshop_orders SET status_name='cokolwiek'
    WHERE id='ffff0000-0000-0000-0000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN v_ok := v_ok || E'\n  OK   twardy blok: zmiana statusu nie dotyka wierszy';
  ELSE v_zle := v_zle || E'\n  BLAD twardy blok przepuscil zmiane statusu'; END IF;

  RESET ROLE;
  RAISE NOTICE '%', v_ok;
  IF v_zle <> '' THEN RAISE EXCEPTION '%', v_zle; END IF;
  RAISE NOTICE 'WSZYSTKIE SIEDEM PRZYPADKOW ZGODNYCH';
END $$;
ROLLBACK;

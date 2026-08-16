-- Przepływ pracownika: mechanik dopisuje robociznę i części do zlecenia,
-- a poprawianie istniejącej pozycji NIE tworzy drugiej.
-- Odtworzony po utracie pliku tymczasowego (16.08). Sprząta po sobie.
DO $$
DECLARE
  v_prov uuid := '664ed87b-a20f-457b-a9fa-97ca13dcae7c';
  v_zlec uuid;
  v_pozycja uuid;
  v_rob int; v_cz int; v_razem int; v_godziny numeric;
BEGIN
  INSERT INTO workshop_orders (provider_id, order_number)
  VALUES (v_prov, 'TESTPRAC-08/2026-990900') RETURNING id INTO v_zlec;

  -- mechanik: 2 robocizny + 2 części, bez cen (wycenia biuro)
  INSERT INTO workshop_order_items (order_id, name, item_type, quantity, unit_price_net, unit_price_gross)
  VALUES (v_zlec,'Wymiana klockow','service',1,NULL,NULL),
         (v_zlec,'Odpowietrzenie ukladu','service',1,NULL,NULL),
         (v_zlec,'Klocki przod','part',1,NULL,NULL),
         (v_zlec,'Plyn hamulcowy','part',1,NULL,NULL);

  UPDATE workshop_order_items SET labor_hours = 1.5 WHERE order_id=v_zlec AND name='Wymiana klockow';
  UPDATE workshop_order_items SET labor_hours = 0.5 WHERE order_id=v_zlec AND name='Odpowietrzenie ukladu';

  SELECT count(*) FILTER (WHERE item_type='service'), count(*) FILTER (WHERE item_type='part')
    INTO v_rob, v_cz FROM workshop_order_items WHERE order_id = v_zlec;
  RAISE NOTICE 'robocizna: %, czesci: %', v_rob, v_cz;

  -- poprawka istniejącej pozycji: aktualizacja, nie nowy wiersz
  SELECT id INTO v_pozycja FROM workshop_order_items WHERE order_id=v_zlec AND name='Klocki przod';
  UPDATE workshop_order_items SET name='Klocki przod (Bosch)', unit_price_gross=280, unit_price_net=227.64
   WHERE id = v_pozycja;
  DELETE FROM workshop_order_items WHERE order_id=v_zlec AND name='Plyn hamulcowy';

  SELECT count(*), COALESCE(sum(labor_hours),0) INTO v_razem, v_godziny
    FROM workshop_order_items WHERE order_id = v_zlec;

  DELETE FROM workshop_orders WHERE id = v_zlec;

  CREATE TEMP TABLE IF NOT EXISTS wynik_pracownika (opis text) ON COMMIT DROP;
  INSERT INTO wynik_pracownika VALUES (format('robocizna: %s, czesci: %s', v_rob, v_cz));
  INSERT INTO wynik_pracownika VALUES (format('pozycji: %s (bez duplikatow po edycji)', v_razem));
  -- Godziny mechanika muszą się zsumować (1.5 + 0.5), bo z nich liczy się raport pracownika.
  INSERT INTO wynik_pracownika VALUES (to_char(v_godziny, 'FM9990.0'));
END $$;

SELECT opis FROM wynik_pracownika;

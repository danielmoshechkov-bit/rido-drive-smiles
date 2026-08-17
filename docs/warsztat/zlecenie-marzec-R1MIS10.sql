-- Odtworzenie usuniętego zlecenia z marca — pojazd R1MIS10.
--
-- ⚠️ TO NIE JEST MIGRACJA. To jednorazowy skrypt wpisujący dane biznesowe.
-- Wklej w SQL Editorze, przeczytaj komunikat na końcu, i dopiero wtedy
-- generuj dokumenty w systemie.
--
-- ⚠️ URUCHOM DOKŁADNIE RAZ. Skrypt nie jest odporny na powtórzenie — drugie
-- uruchomienie założy DRUGIE zlecenie (z numerem …-002), bo nie ma jak
-- odróżnić „to samo zlecenie” od „kolejna naprawa tego auta tego dnia”.
-- Sprawdzone: pierwszy przebieg dał ZL-03/2026-001, drugi ZL-03/2026-002.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 KWOTY SIĘ NIE ZGADZAJĄ — MUSISZ ROZSTRZYGNĄĆ
-- ═══════════════════════════════════════════════════════════════════════════
-- Z Twojej wiadomości dosłownie wychodzi 2510 zł:
--     obudowa chłodnicy z obudową filtra oleju   730
--     uszczelki kolektora 4 × 42                 168
--     wymiana (robocizna)                       1200
--     olej Motul                                 300
--     filtr oleju, oryginał BMW                  112
--                                              ─────
--                                               2510
--
-- Podałeś sumę 2468. Różnica to 42 zł, czyli DOKŁADNIE jedna uszczelka.
-- Pasują dwie wersje i nie zgaduję której:
--     A) uszczelek jest 3, olej 300  → 730 + 126 + 1200 + 300 + 112 = 2468
--     B) uszczelek jest 4, olej 258  → 730 + 168 + 1200 + 258 + 112 = 2468
--
-- Ustaw poniżej jedną z nich. Skrypt PRZERWIE, jeśli suma nie wyjdzie równa
-- `oczekiwana_suma` — nie wpisze zlecenia z kwotą, której nie potwierdziłeś.

DO $$
DECLARE
  -- ── DO USTAWIENIA ─────────────────────────────────────────────────
  v_rejestracja   text := 'R1MIS10';
  v_data          date := DATE '2026-03-10';

  v_uszczelki_ile numeric := 4;      -- wersja A: 3
  v_uszczelka_cena numeric := 42;
  v_olej_cena     numeric := 300;    -- wersja B: 258

  v_obudowa_cena  numeric := 730;
  v_robocizna     numeric := 1200;
  v_filtr_cena    numeric := 112;

  v_oczekiwana_suma numeric := 2468;
  -- ──────────────────────────────────────────────────────────────────

  v_vehicle   record;
  v_order_id  uuid;
  v_numer     text;
  v_prefix    text;
  v_max       int;
  v_next      int;
  v_suma      numeric;
BEGIN
  -- ── 1. Pojazd, warsztat i właściciel ────────────────────────────
  -- Porównanie po znormalizowanej rejestracji: tablice bywają zapisane
  -- ze spacjami albo małymi literami.
  SELECT v.id, v.provider_id, v.owner_client_id, v.brand, v.model, v.plate
    INTO v_vehicle
  FROM workshop_vehicles v
  WHERE upper(replace(v.plate, ' ', '')) = upper(replace(v_rejestracja, ' ', ''))
  LIMIT 1;

  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'Nie ma pojazdu o numerze % — sprawdź pisownię tablicy', v_rejestracja;
  END IF;

  IF v_vehicle.owner_client_id IS NULL THEN
    RAISE EXCEPTION 'Pojazd % nie ma przypisanego właściciela — zlecenie bez klienta nie wystawi faktury', v_rejestracja;
  END IF;

  -- ── 2. Kontrola kwot PRZED zapisem ──────────────────────────────
  v_suma := v_obudowa_cena
          + (v_uszczelki_ile * v_uszczelka_cena)
          + v_robocizna
          + v_olej_cena
          + v_filtr_cena;

  IF v_suma <> v_oczekiwana_suma THEN
    RAISE EXCEPTION
      'Suma pozycji = % zł, a oczekiwana = % zł. Różnica % zł. Popraw liczby na górze skryptu i uruchom ponownie.',
      v_suma, v_oczekiwana_suma, v_suma - v_oczekiwana_suma;
  END IF;

  -- ── 3. Numer zlecenia z MARCA, nie z bieżącego miesiąca ─────────
  -- `next_workshop_order_number` liczy z `now()`, więc dałaby numer sierpniowy.
  -- Powtarzamy tu jej logikę dla marca: pierwszy wolny numer w tym miesiącu.
  v_prefix := 'ZL-03/2026-';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(SPLIT_PART(order_number, '-', 3), '\D', '', 'g'), '')::int), 0)
    INTO v_max
  FROM workshop_orders
  WHERE provider_id = v_vehicle.provider_id AND order_number LIKE v_prefix || '%';

  SELECT MIN(s) INTO v_next
  FROM generate_series(1, v_max + 1) s
  WHERE NOT EXISTS (
    SELECT 1 FROM workshop_orders
    WHERE provider_id = v_vehicle.provider_id
      AND order_number = v_prefix || LPAD(s::text, 3, '0')
  );

  v_numer := v_prefix || LPAD(v_next::text, 3, '0');

  -- Licznik miesiąca też podnosimy, żeby kolejne marcowe zlecenie nie dostało
  -- tego samego numeru.
  INSERT INTO workshop_order_sequences (provider_id, year, month, kind, last_number)
  VALUES (v_vehicle.provider_id, 2026, 3, 'ZL', v_next)
  ON CONFLICT (provider_id, year, month, kind)
  DO UPDATE SET last_number = GREATEST(workshop_order_sequences.last_number, v_next);

  -- ── 4. Zlecenie ─────────────────────────────────────────────────
  INSERT INTO workshop_orders (
    provider_id, vehicle_id, client_id, order_number,
    status_name, description,
    acceptance_date, start_date, completed_at, repaired_at,
    price_mode, total_net, total_gross, created_at, updated_at
  ) VALUES (
    v_vehicle.provider_id, v_vehicle.id, v_vehicle.owner_client_id, v_numer,
    'Gotowe do odbioru',
    'Wymiana obudowy chłodnicy z obudową filtra oleju, uszczelek kolektora, oleju i filtra oleju.',
    v_data, v_data, v_data, v_data,
    -- Ceny podane przez Ciebie traktujemy jako BRUTTO — tak wyglądały
    -- w rozmowie („razem 2468”), a warsztat liczy klientowi kwotę do zapłaty.
    'gross',
    round(v_suma / 1.23, 2), v_suma,
    v_data, now()
  )
  RETURNING id INTO v_order_id;

  -- ── 5. Pozycje ──────────────────────────────────────────────────
  INSERT INTO workshop_order_items
    (order_id, item_type, name, quantity, unit,
     unit_price_gross, unit_price_net, total_gross, total_net, sort_order)
  VALUES
    (v_order_id, 'service', 'Wymiana obudowy chłodnicy, uszczelek kolektora, oleju i filtra',
     1, 'usł.', v_robocizna, round(v_robocizna / 1.23, 2), v_robocizna, round(v_robocizna / 1.23, 2), 1),

    (v_order_id, 'part', 'Obudowa chłodnicy z obudową filtra oleju',
     1, 'szt', v_obudowa_cena, round(v_obudowa_cena / 1.23, 2), v_obudowa_cena, round(v_obudowa_cena / 1.23, 2), 2),

    (v_order_id, 'part', 'Uszczelki kolektora',
     v_uszczelki_ile, 'szt', v_uszczelka_cena, round(v_uszczelka_cena / 1.23, 2),
     v_uszczelki_ile * v_uszczelka_cena, round(v_uszczelki_ile * v_uszczelka_cena / 1.23, 2), 3),

    (v_order_id, 'part', 'Olej Motul',
     1, 'szt', v_olej_cena, round(v_olej_cena / 1.23, 2), v_olej_cena, round(v_olej_cena / 1.23, 2), 4),

    (v_order_id, 'part', 'Filtr oleju, oryginał BMW',
     1, 'szt', v_filtr_cena, round(v_filtr_cena / 1.23, 2), v_filtr_cena, round(v_filtr_cena / 1.23, 2), 5);

  -- ── 6. Kontrola po zapisie ──────────────────────────────────────
  SELECT COALESCE(sum(total_gross), 0) INTO v_suma
  FROM workshop_order_items WHERE order_id = v_order_id;

  IF v_suma <> v_oczekiwana_suma THEN
    RAISE EXCEPTION 'Po zapisie suma pozycji = % zł zamiast % zł. Wycofuję.', v_suma, v_oczekiwana_suma;
  END IF;

  RAISE NOTICE 'Zlecenie % założone: % % (%), klient %, data %, razem % zł brutto.',
    v_numer, v_vehicle.brand, v_vehicle.model, v_vehicle.plate,
    v_vehicle.owner_client_id, v_data, v_suma;
END $$;

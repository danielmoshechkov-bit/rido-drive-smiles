-- Puste zlecenie z 10 marca 2026 na pojazd R1MIS10.
--
-- Odtworzenie zlecenia usuniętego w marcu. Skrypt zakłada SAMO ZLECENIE —
-- bez pozycji i bez kwot. Robociznę, części i ceny wpiszesz w karcie zlecenia,
-- gdzie widzisz je na bieżąco i możesz poprawiać.
--
-- ⚠️ TO NIE JEST MIGRACJA. Jednorazowy skrypt do wklejenia w SQL Editorze.
--
-- ⚠️ URUCHOM DOKŁADNIE RAZ. Nie jest odporny na powtórzenie: drugie
-- uruchomienie założy DRUGIE zlecenie (numer …-002), bo nie ma jak odróżnić
-- „to samo zlecenie” od „kolejna naprawa tego auta tego dnia”.

DO $$
DECLARE
  -- ── DO USTAWIENIA ─────────────────────────────────────────────────
  v_rejestracja text := 'R1MIS10';
  v_data        date := DATE '2026-03-10';
  -- ──────────────────────────────────────────────────────────────────

  v_vehicle  record;
  v_order_id uuid;
  v_numer    text;
  v_prefix   text;
  v_max      int;
  v_next     int;
BEGIN
  -- ── 1. Pojazd, warsztat i właściciel ────────────────────────────
  -- Porównanie po znormalizowanej tablicy: bywa zapisana ze spacjami
  -- albo małymi literami.
  SELECT v.id, v.provider_id, v.owner_client_id, v.brand, v.model, v.plate
    INTO v_vehicle
  FROM workshop_vehicles v
  WHERE upper(replace(v.plate, ' ', '')) = upper(replace(v_rejestracja, ' ', ''))
  LIMIT 1;

  IF v_vehicle.id IS NULL THEN
    RAISE EXCEPTION 'Nie ma pojazdu o numerze % — sprawdź pisownię tablicy', v_rejestracja;
  END IF;

  -- Brak właściciela NIE przerywa: zlecenie powstanie, a klienta przypiszesz
  -- w karcie. Ale mówimy o tym głośno, bo bez klienta nie wystawisz faktury.
  IF v_vehicle.owner_client_id IS NULL THEN
    RAISE WARNING 'Pojazd % nie ma przypisanego właściciela — przypisz klienta w karcie zlecenia przed fakturą', v_rejestracja;
  END IF;

  -- ── 2. Numer z MARCA, nie z bieżącego miesiąca ──────────────────
  -- `next_workshop_order_number` bierze miesiąc z `now()`, więc nadałaby numer
  -- sierpniowy. Powtarzamy jej logikę dla marca: pierwszy wolny numer.
  v_prefix := 'ZL-' || to_char(v_data, 'MM') || '/' || to_char(v_data, 'YYYY') || '-';

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

  -- Licznik miesiąca podnosimy razem z numerem, żeby kolejne marcowe zlecenie
  -- nie dostało tego samego.
  INSERT INTO workshop_order_sequences (provider_id, year, month, kind, last_number)
  VALUES (v_vehicle.provider_id,
          EXTRACT(YEAR FROM v_data)::int, EXTRACT(MONTH FROM v_data)::int, 'ZL', v_next)
  ON CONFLICT (provider_id, year, month, kind)
  DO UPDATE SET last_number = GREATEST(workshop_order_sequences.last_number, v_next);

  -- ── 3. Zlecenie ─────────────────────────────────────────────────
  INSERT INTO workshop_orders (
    provider_id, vehicle_id, client_id, order_number,
    status_name, acceptance_date, start_date,
    price_mode, total_net, total_gross, created_at, updated_at
  ) VALUES (
    v_vehicle.provider_id, v_vehicle.id, v_vehicle.owner_client_id, v_numer,
    -- „Nowe zlecenie”, żeby dało się swobodnie edytować pozycje. Status
    -- zmienisz w karcie, gdy wpiszesz robociznę i części.
    'Nowe zlecenie',
    v_data, v_data,
    -- Ceny wpisujesz w karcie; tryb brutto, bo tak liczysz klientowi.
    'gross', 0, 0,
    -- `created_at` z marca, żeby zlecenie ustawiło się w historii tam, gdzie
    -- było, a nie na górze listy.
    v_data, now()
  )
  RETURNING id INTO v_order_id;

  RAISE NOTICE 'Założone zlecenie %  —  % % (%), data %, zero pozycji. Otwórz je w karcie i wpisz robociznę oraz części.',
    v_numer, v_vehicle.brand, v_vehicle.model, v_vehicle.plate, v_data;
END $$;

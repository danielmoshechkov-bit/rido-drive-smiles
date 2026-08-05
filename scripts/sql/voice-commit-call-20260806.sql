-- =============================================================================
-- voice_commit_call — CAŁY zapis rozmowy w JEDNEJ transakcji
--
-- Zastępuje cztery niezależne wywołania robione DZIŚ W TRAKCIE ROZMOWY:
--   create_booking -> service_bookings
--                  -> workshop_client_bookings (grafik)
--                  -> workshop-send-sms
--                  -> create_order przez HTTP do samego siebie
-- Pomiar 06.08 00:41: 2881 ms, a w najgorszym przypadku 5743 ms i 53% tury.
--
-- ZASADA 5 i 16: JEDYNY klucz idempotencji to p_conversation_id.
--   NIE client_id + okno czasu (tak psuł się create_order — 15 min)
--   NIE telefon + data + godzina (tak psuł się dedup rezerwacji)
--   NIE telefon + 60 minut (tak psuje się dopasowanie transkryptu)
-- Pięć niezależnych miejsc miało ten błąd. Tutaj jest jedno miejsce i jeden klucz.
--
-- ZASADA 17: funkcja NIE woła create_order ani create_booking. Gdyby wołała,
-- odziedziczyłaby ich dedupy i wyglądałoby to jak nowa usterka transakcji.
--
-- ZASADA 14: zwraca CO SIĘ STAŁO (status + co powstało), nie samo "ok".
--
-- ATOMOWOŚĆ: całość w jednej funkcji plpgsql = jedna transakcja. Błąd na dowolnym
-- kroku wycofuje wszystko. SMS jest CELOWO poza funkcją — nie da się go wycofać,
-- więc wychodzi dopiero po jej sukcesie.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.voice_commit_call(
  p_conversation_id text,
  p_provider_id     uuid,
  p_first_name      text,
  p_last_name       text,
  p_phone           text,
  p_brand           text,
  p_model           text,
  p_plate           text,
  p_complaint       text,
  p_date            date,
  p_time            time,
  p_duration_min    int  DEFAULT 60,
  p_needs_review    boolean DEFAULT false,
  p_review_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id     uuid;
  v_existing    uuid;
  v_client_id   uuid;
  v_vehicle_id  uuid;
  v_booking_id  uuid;
  v_calendar_id uuid;
  v_station_id  uuid;
  v_order_id    uuid;
  v_order_no    text;
  v_status_name text := 'Umówiony telefonicznie';
  v_seq         int;
  v_public_tok  text;
BEGIN
  -- 1. IDEMPOTENCJA — jedno miejsce, jeden klucz.
  SELECT id, linked_entity_id INTO v_call_id, v_existing
    FROM voice_calls
   WHERE provider_id = p_provider_id
     AND elevenlabs_conversation_id = p_conversation_id;

  IF v_call_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_call', 'message',
      'Brak wiersza voice_calls dla tej rozmowy — webhook inicjujący nie zadziałał.');
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'call_id', v_call_id, 'order_id', v_existing);
  END IF;

  -- 2. KLIENT po ostatnich dziewięciu cyfrach telefonu. Bez okna czasowego.
  SELECT id INTO v_client_id FROM workshop_clients
   WHERE provider_id = p_provider_id
     AND right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 9)
       = right(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), 9)
     AND length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 9
   ORDER BY created_at LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO workshop_clients (provider_id, client_type, first_name, last_name, phone)
    VALUES (p_provider_id, 'private', coalesce(p_first_name, 'Klient'), p_last_name, p_phone)
    RETURNING id INTO v_client_id;
  END IF;

  -- 3. POJAZD po znormalizowanej rejestracji.
  IF p_plate IS NOT NULL AND length(p_plate) > 0 THEN
    SELECT id INTO v_vehicle_id FROM workshop_vehicles
     WHERE provider_id = p_provider_id
       AND upper(regexp_replace(coalesce(plate,''), '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(p_plate, '[^A-Za-z0-9]', '', 'g'))
     ORDER BY created_at LIMIT 1;

    IF v_vehicle_id IS NULL THEN
      INSERT INTO workshop_vehicles (provider_id, owner_client_id, brand, model, plate)
      VALUES (p_provider_id, v_client_id, p_brand, p_model,
              upper(regexp_replace(p_plate, '[^A-Za-z0-9]', '', 'g')))
      RETURNING id INTO v_vehicle_id;
    END IF;
  END IF;

  -- 4. REZERWACJA.
  INSERT INTO service_bookings (
    provider_id, customer_name, customer_phone, scheduled_date, scheduled_time,
    duration_minutes, customer_notes, vehicle_brand, vehicle_model, vehicle_plate,
    status, completion_status, requires_provider_confirmation, source)
  VALUES (
    p_provider_id, trim(coalesce(p_first_name,'') || ' ' || coalesce(p_last_name,'')),
    p_phone, p_date, p_time, p_duration_min,
    '[Z ROZMOWY AI] ' || coalesce(p_complaint,''), p_brand, p_model, p_plate,
    'pending', 'pending', true, 'portal')
  RETURNING id INTO v_booking_id;

  -- 5. STANOWISKO — pierwsze WOLNE o tej godzinie.
  --    To samo kryterium co check_availability (zasada z rozmowy 05.08:
  --    create_booking sprawdzał klienta zamiast stanowiska i odrzucał wolny termin).
  SELECT w.id INTO v_station_id
    FROM workshop_workstations w
   WHERE w.provider_id = p_provider_id AND w.is_active
     AND NOT EXISTS (
       SELECT 1 FROM workshop_client_bookings b
        WHERE b.provider_id = p_provider_id AND b.station_id = w.id
          AND b.appointment_date = p_date AND b.appointment_time = p_time
          AND b.status <> 'cancelled')
   ORDER BY w.sort_order NULLS LAST, w.created_at
   LIMIT 1;

  IF v_station_id IS NULL THEN
    RAISE EXCEPTION 'Brak wolnego stanowiska na % %', p_date, p_time
      USING ERRCODE = 'check_violation';
  END IF;

  -- 6. GRAFIK. Bez station_id rezerwacja nie pojawia się na siatce
  --    (WorkshopScheduler mapuje station_id -> scheduled_station_id).
  INSERT INTO workshop_client_bookings (
    provider_id, phone, first_name, last_name, plate, brand, model,
    service_description, appointment_date, appointment_time, duration_minutes,
    status, reminder_enabled, reminder_times, station_id)
  VALUES (
    p_provider_id, p_phone, coalesce(p_first_name,'Klient'), p_last_name,
    p_plate, p_brand, p_model,
    '[Z ROZMOWY AI] ' || coalesce(p_complaint,''), p_date, p_time, p_duration_min,
    'scheduled', true, ARRAY['24h'], v_station_id)
  RETURNING id, public_token INTO v_calendar_id, v_public_tok;

  -- 7. STATUS ZLECENIA — utwórz raz, jeśli provider go nie ma.
  INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order)
  SELECT p_provider_id, v_status_name, '#0ea5e9', 1
   WHERE NOT EXISTS (
     SELECT 1 FROM workshop_order_statuses
      WHERE provider_id = p_provider_id AND name = v_status_name);

  -- 8. ZLECENIE. Numeracja per provider i miesiąc, liczona wewnątrz transakcji.
  SELECT count(*) + 1 INTO v_seq FROM workshop_orders
   WHERE provider_id = p_provider_id
     AND date_trunc('month', created_at) = date_trunc('month', now());
  v_order_no := 'ZLP-' || to_char(now(), 'MM/YYYY') || '-' || lpad(v_seq::text, 3, '0');

  INSERT INTO workshop_orders (
    provider_id, client_id, vehicle_id, booking_id, order_number,
    status_name, description, scheduled_date, scheduled_station_id, station_id,
    internal_notes)
  VALUES (
    p_provider_id, v_client_id, v_vehicle_id, v_booking_id, v_order_no,
    v_status_name, coalesce(p_complaint, 'Zgłoszenie telefoniczne'),
    p_date, v_station_id, v_station_id,
    CASE WHEN p_needs_review THEN '[DO SPRAWDZENIA] ' || coalesce(p_review_reason,'') END)
  RETURNING id INTO v_order_id;

  -- 9. POWIĄZANIE ROZMOWY. Tego szuka zakładka "Rozmowa telefoniczna".
  UPDATE voice_calls
     SET linked_entity_type = 'workshop_order',
         linked_entity_id   = v_order_id,
         status             = CASE WHEN p_needs_review THEN 'needs_review' ELSE 'completed' END,
         outcome            = CASE WHEN p_needs_review THEN p_review_reason ELSE 'booked' END
   WHERE id = v_call_id;

  RETURN jsonb_build_object(
    'status', 'committed',
    'call_id', v_call_id,
    'client_id', v_client_id,
    'vehicle_id', v_vehicle_id,
    'booking_id', v_booking_id,
    'calendar_id', v_calendar_id,
    'station_id', v_station_id,
    'order_id', v_order_id,
    'order_number', v_order_no,
    'public_token', v_public_tok,
    'needs_review', p_needs_review);
END;
$$;

REVOKE ALL ON FUNCTION public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time, int, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time, int, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time, int, boolean, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time, int, boolean, text) TO service_role;

COMMENT ON FUNCTION public.voice_commit_call IS
  'Caly zapis rozmowy agenta glosowego w jednej transakcji: klient, pojazd, '
  'rezerwacja, stanowisko, grafik, zlecenie, powiazanie rozmowy. Idempotencja '
  'wylacznie po conversation_id. SMS celowo POZA funkcja, bo nie da sie go wycofac.';

-- ---------------------------------------------------------------------------
-- KONTROLA po utworzeniu — NIE zapisuje, bo cofa transakcję.
-- ---------------------------------------------------------------------------
-- BEGIN;
--   SELECT jsonb_pretty(public.voice_commit_call(
--     'conv_TEST_ROLLBACK', '664ed87b-a20f-457b-a9fa-97ca13dcae7c',
--     'Test', NULL, '519474583', 'BMW', 'X5', 'WY996EU',
--     'Kontrola migracji', '2026-12-31'::date, '09:00'::time));
-- ROLLBACK;
--
-- Oczekiwane: status "no_call" — bo dla tego conversation_id nie ma wiersza
-- voice_calls. To potwierdza, że idempotencja i strażnik wejścia działają.

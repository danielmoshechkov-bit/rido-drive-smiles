-- ============================================================================
-- COMMIT WERYFIKUJE TERMIN, KTÓRY WRÓCIŁ OD MODELU
--
-- Rozmowa 22.08 09:32 (sobota): klient umówiony na NIEDZIELĘ 23.08, w dniu
-- zamkniętym. Rezerwacja powstała (workshop_client_bookings, status
-- `scheduled`), SMS z tą datą wyszedł. SMS był zgodny z bazą — to baza była zła.
--
-- Przyczyna jest jedna i szersza niż dni zamknięte: SPRAWDZAMY DANE, KTÓRE
-- WYSYŁAMY DO MODELU, A NIE TE, KTÓRE OD NIEGO WRACAJĄ. Snapshot pilnuje
-- grafiku na wejściu — godziny pracy, zajętość, ostatni możliwy start — a commit
-- przyjmował datę i godzinę tak, jak przyszły.
--
-- CO COMMIT SPRAWDZAŁ DO DZIŚ:
--   ✔ konflikt stanowiska (brak wolnego → wyjątek)
--   ✔ brak daty lub godziny → status „Oddzwonić", bez wpisu do grafiku
--
-- CZEGO NIE SPRAWDZAŁ (wszystko poniżej dawało rezerwację niewykonalną):
--   ✘ dzień zamknięty            → klient przyjeżdża pod zamknięte drzwi
--   ✘ godzina poza godzinami pracy
--   ✘ termin w przeszłości
--   ✘ usługa nie zdąży przed zamknięciem (ostatni możliwy start)
--
-- ODRZUCONY TERMIN IDZIE ISTNIEJĄCĄ ŚCIEŻKĄ „brak terminu": zlecenie ze statusem
-- „Oddzwonić", bez wpisu do grafiku i BEZ SMS-a — `voice-call-commit` wysyła go
-- wyłącznie przy `bez_terminu = false`. Jednym warunkiem znikają oba objawy.
--
-- NIE PODSTAWIAMY INNEJ DATY. Cicha zmiana terminu na najbliższy otwarty dzień
-- byłaby gorsza niż odmowa: klient usłyszał w rozmowie jedną datę, a dostałby
-- SMS z inną. Warsztat oddzwania i umawia sam.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.voice_termin_niemozliwy(
  p_provider_id uuid, p_date date, p_time time, p_duration_min integer DEFAULT 60)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_godziny jsonb;
  v_dzien   jsonb;
  v_klucz   text;
  v_open    time;
  v_close   time;
BEGIN
  IF p_date IS NULL OR p_time IS NULL THEN
    RETURN NULL;   -- brak terminu obsługuje wywołujący, to nie jest „termin zły"
  END IF;

  -- TERMIN W PRZESZŁOŚCI. Rozmowa trwa minutę, więc minutę wstecz uznajemy za
  -- teraźniejszość — inaczej wizyta „za pięć minut" padałaby na zaokrągleniu.
  IF (p_date + p_time) < (now() AT TIME ZONE 'Europe/Warsaw') - interval '5 minutes' THEN
    RETURN 'termin w przeszłości';
  END IF;

  SELECT working_hours INTO v_godziny FROM service_providers WHERE id = p_provider_id;

  -- BRAK GODZIN PRACY TO NIE JEST ZGODA NA WSZYSTKO, ale nie jest też powodem
  -- do odrzucenia: warsztat bez wypełnionego grafiku miałby wtedy każdą wizytę
  -- odrzuconą i nie wiedziałby dlaczego. Zostawiamy przejście, resztę pilnuje
  -- snapshot (dzień bez godzin i tak nie ma wolnych slotów).
  IF v_godziny IS NULL THEN RETURN NULL; END IF;

  v_klucz := lower(to_char(p_date, 'dy'));   -- mon, tue, …
  v_dzien := v_godziny -> v_klucz;
  IF v_dzien IS NULL THEN RETURN NULL; END IF;

  IF COALESCE((v_dzien ->> 'closed')::boolean, false) THEN
    RETURN 'warsztat zamknięty w tym dniu';
  END IF;

  v_open  := NULLIF(v_dzien ->> 'open', '')::time;
  v_close := NULLIF(v_dzien ->> 'close', '')::time;
  IF v_open IS NULL OR v_close IS NULL THEN RETURN NULL; END IF;

  IF p_time < v_open THEN
    RETURN 'godzina przed otwarciem (' || to_char(v_open, 'HH24:MI') || ')';
  END IF;

  -- USŁUGA MA SIĘ ZMIEŚCIĆ PRZED ZAMKNIĘCIEM, a nie tylko zacząć przed nim.
  -- To jest `ostatni_mozliwy_start` ze snapshotu, sprawdzony po drugiej stronie.
  IF p_time + make_interval(mins => COALESCE(p_duration_min, 60)) > v_close THEN
    RETURN 'usługa nie zdąży przed zamknięciem (' || to_char(v_close, 'HH24:MI') || ')';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.voice_termin_niemozliwy(uuid, date, time, integer) TO service_role;

-- ============================================================================
-- voice_commit_call — TA SAMA definicja co dotąd, z czterema podstawieniami.
-- Reszta ciała nietknięta (wygenerowane z definicji pobranej z produkcji).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_commit_call(p_conversation_id text, p_provider_id uuid, p_first_name text, p_last_name text, p_phone text, p_brand text, p_model text, p_plate text, p_complaint text, p_date date, p_time time without time zone, p_duration_min integer DEFAULT 60, p_needs_review boolean DEFAULT false, p_review_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_public_tok  text;
  v_powod       text;      -- dlaczego termin odrzucony; NULL = termin dobry
  v_bez_term    boolean;   -- termin niemozliwy ALBO nie podany
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
    -- 'individual', NIE 'private'. Ograniczenie workshop_clients_client_type_check
    -- dopuszcza wyłącznie 'individual' i 'company'. voice-agent-tools miał tu
    -- 'private' i przez to KAŻDY nowy klient wywalał create_order — złapane
    -- testem w BEGIN/ROLLBACK, na produkcji objawiało się jako "ok=false".
    VALUES (p_provider_id, 'individual', coalesce(p_first_name, 'Klient'), p_last_name, p_phone)
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

  -- 4. REZERWACJA — TYLKO gdy termin jest potwierdzony.
  --
  -- DRUGA ŚCIEŻKA: rozmowa sensowna, ale termin nie padł. Dziś taka rozmowa znika
  -- bez śladu. Teraz powstaje ZLECENIE BEZ REZERWACJI, ze statusem "Oddzwonić" —
  -- bo brak terminu znaczy, że ktoś ma zadzwonić i go ustalić, a to konkretne
  -- działanie, nie samo sprawdzenie.
  --   z terminem:  rezerwacja -> stanowisko -> grafik -> zlecenie ZLP
  --   bez terminu:                                    -> zlecenie ZL
  -- Prefiks wybiera trigger po obecności booking_id, więc warsztat od razu widzi,
  -- że to zlecenie bez umówionej wizyty.
  -- Zlecenie bez terminu NIE TRAFIA DO GRAFIKU — nie ma na czym go umieścić.
  -- WERYFIKACJA TERMINU, KTORY WROCIL OD MODELU.
  --
  -- Do 22.08 commit zapisywal date i godzine tak, jak przyszly. Snapshot pilnuje
  -- grafiku na WEJSCIU, ale to, co WRACA od modelu, nie bylo sprawdzane wcale —
  -- 22.08 klient zostal umowiony na niedziele, w dniu zamknietym warsztatu.
  --
  -- Odrzucony termin idzie ISTNIEJACA sciezka "brak terminu": zlecenie
  -- ze statusem 'Oddzwonic', bez wpisu do grafiku i BEZ SMS-a (voice-call-commit
  -- wysyla go tylko przy `bez_terminu = false`). Nie podstawiamy innej daty —
  -- warsztat oddzwania i umawia sam.
  v_powod    := public.voice_termin_niemozliwy(p_provider_id, p_date, p_time, p_duration_min);
  v_bez_term := (p_date IS NULL OR p_time IS NULL OR v_powod IS NOT NULL);

  IF v_bez_term THEN
    v_status_name := 'Oddzwonić';
  ELSE
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
          AND b.appointment_date = p_date
          AND b.status <> 'cancelled'
          -- PRZEDZIAL, NIE PUNKT.
          --
          -- Bylo `appointment_time = p_time`, czyli kolizja tylko przy IDENTYCZNEJ
          -- godzinie. Rezerwacja 11:00 na dwie godziny nie blokowala 12:00 na tym
          -- samym stanowisku — dwa auta na jednym podnosniku, oba "poprawnie"
          -- zapisane. OVERLAPS liczy przeciecie przedzialow, wiec 11:00+120min
          -- i 12:00+60min wykluczaja sie tak, jak powinny.
          AND (b.appointment_time,
               b.appointment_time + make_interval(mins => COALESCE(b.duration_minutes, 60)))
              OVERLAPS
              (p_time, p_time + make_interval(mins => COALESCE(p_duration_min, 60))))
   ORDER BY w.sort_order NULLS LAST, w.created_at
   LIMIT 1;

  IF v_station_id IS NULL THEN
    RAISE EXCEPTION 'Brak wolnego stanowiska na % %', p_date, p_time
      USING ERRCODE = 'check_violation';
  END IF;

  -- UWAGA NA DWIE TABELE STANOWISK, złapane testem w BEGIN/ROLLBACK:
  --   workshop_orders.station_id      -> FK do workshop_stations      (2 wiersze)
  --   workshop_orders.workstation_id  -> FK do workshop_workstations  (12 wierszy)
  -- Grafik i check_availability operują na workshop_workstations, więc zlecenie
  -- dostaje `workstation_id` i `scheduled_station_id`, a NIE `station_id`.
  -- Pierwsza wersja wpisywała identyfikator do złej kolumny i transakcja padała
  -- na kluczu obcym.

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
  END IF;

  -- 7. STATUS ZLECENIA — utwórz raz, jeśli provider go nie ma.
  INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order)
  SELECT p_provider_id, v_status_name, '#0ea5e9', 1
   WHERE NOT EXISTS (
     SELECT 1 FROM workshop_order_statuses
      WHERE provider_id = p_provider_id AND name = v_status_name);

  -- 8. ZLECENIE.
  --
  -- NUMERU NIE NADAJEMY SAMI. Na workshop_orders działa trigger
  -- `trg_workshop_order_number`, który woła istniejącą od dawna funkcję
  -- `next_workshop_order_number(provider_id, kind)` — z blokadą wiersza
  -- w `workshop_order_sequences` i wyborem ZLP/ZL po obecności booking_id.
  --
  -- Pierwsza wersja tej funkcji liczyła numer sama przez count(*)+1, a druga
  -- dokładała własny licznik w osobnej tabeli. Oba były DUPLIKATEM mechanizmu,
  -- który projekt już miał — a przeciążenie next_workshop_order_number(uuid)
  -- wprowadziło niejednoznaczność dla wywołań jednoargumentowych.
  -- Numer bierzemy z RETURNING, po tym jak trigger go nada.
  INSERT INTO workshop_orders (
    provider_id, client_id, vehicle_id, booking_id,
    status_name, description, scheduled_date, scheduled_station_id, workstation_id,
    internal_notes)
  VALUES (
    p_provider_id, v_client_id, v_vehicle_id, v_booking_id,
    v_status_name, coalesce(p_complaint, 'Zgłoszenie telefoniczne'),
    p_date, v_station_id, v_station_id,   -- oba wskazują workshop_workstations
    -- NOTATKA MA MOWIC, CO SIE STALO, bez wchodzenia do logow.
    -- Powod jest konkretny („warsztat zamkniety w tym dniu"), a data i godzina
    -- sa w niej wprost — inaczej warsztat widzi „Oddzwonic" i nie wie dlaczego.
    CASE
      WHEN v_powod IS NOT NULL THEN
        '[TERMIN ODRZUCONY] Agent zaproponowal ' || to_char(p_date, 'DD.MM.YYYY')
        || ' o ' || to_char(p_time, 'HH24:MI') || ' — ' || v_powod
        || '. Rezerwacja NIE zostala zalozona, SMS nie wyszedl.'
      WHEN p_needs_review THEN '[DO SPRAWDZENIA] ' || coalesce(p_review_reason,'')
    END)
  RETURNING id, order_number INTO v_order_id, v_order_no;

  -- 8b. STATUS REAKCJI. Kryterium (b) z doprecyzowaniem: pojazd jest nieznany
  --     dopiero gdy NIE MA ani rejestracji, ani marki. Sama marka wystarcza —
  --     mechanik widzi auto na miejscu, rejestracja to wygoda, nie warunek.
  IF v_status_name <> 'Oddzwonić'
     AND (p_needs_review OR (p_plate IS NULL AND p_brand IS NULL)) THEN
    UPDATE workshop_orders SET status_name = 'Wymaga uwagi' WHERE id = v_order_id;
    v_status_name := 'Wymaga uwagi';
  END IF;

  -- 9. POWIĄZANIE ROZMOWY. Tego szuka zakładka "Rozmowa telefoniczna".
  UPDATE voice_calls
     SET linked_entity_type = 'workshop_order',
         linked_entity_id   = v_order_id,
         status             = CASE WHEN p_needs_review OR v_bez_term
                                   THEN 'needs_review' ELSE 'completed' END,
         outcome            = CASE WHEN v_powod IS NOT NULL
                                   THEN 'Termin odrzucony: ' || v_powod || ' — oddzwonić'
                                   WHEN p_date IS NULL OR p_time IS NULL
                                   THEN 'Brak potwierdzonego terminu — oddzwonić'
                                   WHEN p_needs_review THEN p_review_reason
                                   ELSE 'booked' END
   WHERE id = v_call_id;

  -- ALERT DLA NAS, NIE DLA WARSZTATU. Kazde odrzucenie znaczy, ze agent
  -- zaproponowal termin, ktorego nie powinien byl zaproponowac — czyli zawiodl
  -- snapshot albo prompt. Warsztat dostaje notatke; my chcemy o tym wiedziec.
  IF v_powod IS NOT NULL THEN
    INSERT INTO system_alerts (type, category, status, title, description, metadata)
    VALUES ('warning', 'system', 'pending',
            'Agent zaproponowal termin niemozliwy do zrealizowania',
            'Powod: ' || v_powod || '. Data ' || to_char(p_date, 'DD.MM.YYYY')
              || ' ' || to_char(p_time, 'HH24:MI')
              || '. Zlecenie ' || coalesce(v_order_no, '?') || ' poszlo do Oddzwonic.',
            jsonb_build_object('zrodlo', 'voice_commit_call', 'provider_id', p_provider_id,
                               'powod', v_powod, 'order_id', v_order_id,
                               'conversation_id', p_conversation_id));
  END IF;

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
    'status_zlecenia', v_status_name,
    'bez_terminu', v_bez_term,
    'powod_odrzucenia', v_powod,
    'public_token', v_public_tok,
    'needs_review', p_needs_review);
END;
$function$
;

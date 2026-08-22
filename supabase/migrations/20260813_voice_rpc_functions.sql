-- ============================================================================
-- voice_commit_call + get_voice_context — ZAPIS ISTNIEJĄCEGO STANU PRODUKCJI
--
-- Obie funkcje DZIAŁAJĄ na produkcji od 11.08, ale nigdy nie było ich w żadnej
-- migracji. Powstały przez `db query` i istniały wyłącznie w bazie. To znaczy,
-- że reset schematu albo odtworzenie środowiska z repozytorium dawało bazę,
-- w której agent głosowy przyjmuje rozmowy i NIC NIE ZAPISUJE — bez żadnego
-- śladu w gicie, że czegoś brakuje.
--
-- Ta migracja niczego nie zmienia. Ciało funkcji jest pobrane z produkcji przez
-- pg_get_functiondef i wklejone znak w znak, a `CREATE OR REPLACE` na identycznym
-- ciele to operacja pusta. Jej sensem jest to, żeby od dziś stan bazy dało się
-- odtworzyć z repozytorium.
--
-- Zweryfikowane przed zapisem:
--   security_definer = true, search_path = public   (obie)
--   uprawnienia: EXECUTE tylko dla postgres i service_role, PUBLIC odebrane
--   voice_commit_call: 14 argumentów, 3 z wartością domyślną
--
-- ⚠️  KOLEJNOŚĆ ARGUMENTÓW JEST CZĘŚCIĄ KONTRAKTU. Woła je voice-call-commit
--     przez RPC po nazwach (p_conversation_id, p_provider_id, …). Zmiana nazwy
--     argumentu zrywa wywołanie po stronie Edge Function, mimo że SQL się skompiluje.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_voice_context(p_provider_id uuid, p_persona_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'config', (
      SELECT to_jsonb(c) FROM (
        SELECT business_context, display_name, languages,
               calendar_access, orders_access, voice_id, elevenlabs_agent_id,
               learning_mode, contribute_to_global
          FROM voice_agent_configs
         WHERE provider_id = p_provider_id AND persona_key = p_persona_key
         LIMIT 1
      ) c
    ),
    'persona', (
      SELECT to_jsonb(p) FROM (
        SELECT persona_key, name, direction, provider_agent_id,
               default_model, default_voice_id
          FROM voice_agent_personas
         WHERE persona_key = p_persona_key
         LIMIT 1
      ) p
    ),
    'agent', (
      SELECT to_jsonb(a) FROM (
        SELECT model, system_prompt
          FROM ai_agents_config
         WHERE agent_id = COALESCE(
                 (SELECT provider_agent_id FROM voice_agent_personas
                   WHERE persona_key = p_persona_key LIMIT 1),
                 'voice_workshop_secretary')
         LIMIT 1
      ) a
    ),
    -- Te same warunki co zapytanie, które to zastępuje: aktywne reguły persony,
    -- własne tenanta plus globalne, dziesięć najlepiej udokumentowanych.
    'knowledge', COALESCE((
      SELECT jsonb_agg(k ORDER BY k.evidence_count DESC NULLS LAST) FROM (
        SELECT category, situation, recommended_response, evidence_count
          FROM voice_agent_knowledge
         WHERE persona_key = p_persona_key
           AND is_active = true
           AND (provider_id = p_provider_id OR provider_id IS NULL)
         ORDER BY evidence_count DESC NULLS LAST
         LIMIT 10
      ) k
    ), '[]'::jsonb)
  );
$function$;

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
  IF p_date IS NULL OR p_time IS NULL THEN
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
          AND b.appointment_date = p_date AND b.appointment_time = p_time
          AND b.status <> 'cancelled')
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
    CASE WHEN p_needs_review THEN '[DO SPRAWDZENIA] ' || coalesce(p_review_reason,'') END)
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
         status             = CASE WHEN p_needs_review OR p_date IS NULL OR p_time IS NULL
                                   THEN 'needs_review' ELSE 'completed' END,
         outcome            = CASE WHEN p_date IS NULL OR p_time IS NULL
                                   THEN 'Brak potwierdzonego terminu — oddzwonić'
                                   WHEN p_needs_review THEN p_review_reason
                                   ELSE 'booked' END
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
    'status_zlecenia', v_status_name,
    'bez_terminu', (p_date IS NULL OR p_time IS NULL),
    'public_token', v_public_tok,
    'needs_review', p_needs_review);
END;
$function$;


-- Uprawnienia odtworzone dokładnie tak, jak są na produkcji: PUBLIC nie ma
-- prawa wykonania, bo obie funkcje są SECURITY DEFINER i obchodzą RLS.
-- voice_commit_call zakłada klientów, pojazdy, rezerwacje i zlecenia; wywołanie
-- z anonimowego klucza byłoby zapisem do cudzego warsztatu.
REVOKE ALL ON FUNCTION public.get_voice_context(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time without time zone, integer, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_voice_context(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time without time zone, integer, boolean, text) TO service_role;

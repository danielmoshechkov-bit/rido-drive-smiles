-- Zamknięcie polityk `USING (true)` osiągalnych bez zalogowania i przez obcych.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZOSTAŁO POTWIERDZONE — ZACHOWANIEM, NIE ODCZYTEM
-- ═══════════════════════════════════════════════════════════════════════════
-- 13.09.2026, w transakcji WYCOFANEJ na produkcji, pod rolą `anon`
-- i `authenticated` (obie mają `rolbypassrls = false`, więc RLS naprawdę
-- działa). Kontrole, bez których wynik byłby bez wartości:
--
--   POZYTYWNA  anon czyta `car_brands`                     → 61 wierszy  ✓
--   NEGATYWNA  anon czyta `user_invoices`                  → 0 wierszy   ✓
--
-- Skoro narzędzie i pokazuje, i blokuje, wyniki niżej są miarodajne:
--
--   anon CZYTA cudze terminy oglądania                     → 1 wiersz
--   anon ZMIENIA cudzy termin oglądania                    → 1 wiersz
--   anon DOPISUJE wpis do `audit_log`                      → przeszło
--   obcy zalogowany CZYTA cudze przeniesienia własności    → 1 wiersz
--   obcy zalogowany ZMIENIA cudze przeniesienie własności  → 1 wiersz
--
-- Osobny przemiat INSERT-ów pod rolą `anon` na dwunastu tabelach: **zero
-- odmów**. Jedenaście padło na `NOT NULL` (23502), jedno na `CHECK` (23514) —
-- to jest kształt danych, nie uprawnienie. Polityka przepuściła każdy z nich.
--
-- ⚠️ `coin_transactions` był w pierwszym podejściu odczytany jako bezpieczny,
-- bo `EXCEPTION` łapał `insufficient_privilege` RAZEM z `check_violation`.
-- SQLSTATE rozstrzygnął: 23514, czyli polityka POZWOLIŁA na dopisanie do
-- księgi monet, a zapis padł tylko na wartości `type`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO ZAMKNIĘCIE NICZEGO NIE PSUJE
-- ═══════════════════════════════════════════════════════════════════════════
-- `service_role` ma `rolbypassrls = true` — funkcje brzegowe piszą kluczem
-- serwisowym i polityki ich nie dotyczą. Sprawdzone, kto pisze z FRONTU:
--
--   coin_transactions          front tylko CZYTA (`useUserWallet`)
--   ksef_monitor_scans         front tylko CZYTA
--   voice_phrase_cache         front czyta i kasuje, nie wstawia
--   ai_call_audit_log          front nie dotyka
--   workspace_task_history     front nie dotyka
--   universal_listing_numbers  front nie dotyka
--   ai_guest_usage             front nie dotyka
--   ksef_monitor_alerts        front CZYTA i AKTUALIZUJE (osobna polityka, nietknięta)
--   viewing_slots              front nie dotyka; `schedule-viewings` ma klucz serwisowy
--   audit_log                  front WSTAWIA (`InvoiceEditor`) — stąd polityka dla
--                              zalogowanych zamiast zniknięcia bez zamiennika
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO ŚWIADOMIE NIE RUSZAMY
-- ═══════════════════════════════════════════════════════════════════════════
-- `service_bookings`, `service_provider_requests`,
-- `real_estate_listing_interactions` — to są PUBLICZNE FORMULARZE. Zapis bez
-- zalogowania jest tam zamierzony: rezerwację składa ktoś, kto nie ma konta.
-- Zostaje ryzyko zaśmiecenia i to jest osobna sprawa (ograniczenie tempa),
-- nie wyciek danych.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TERMINY OGLĄDANIA — nikt z ulicy nie zmienia cudzego terminu
-- ---------------------------------------------------------------------------
-- Nazwa polityki mówiła „by token", ale tokenu nie sprawdzała. Potwierdzanie
-- terminu przez agenta idzie przez `schedule-viewings`, która ma klucz
-- serwisowy — więc po zdjęciu polityk działa dalej.
DROP POLICY IF EXISTS "Anyone can view slots by token"   ON public.viewing_slots;
DROP POLICY IF EXISTS "Anyone can update slots by token" ON public.viewing_slots;

-- ---------------------------------------------------------------------------
-- 2. PRZENIESIENIA WŁASNOŚCI POJAZDU — związane z telefonem właściciela
-- ---------------------------------------------------------------------------
-- Front filtruje po telefonie, ale filtr po stronie przeglądarki nie jest
-- zabezpieczeniem: wystarczy go zdjąć. Prawidłowe polityki napisano
-- w `20260613130000_workshop_ownership_rls_and_transfer.sql`, która nigdy nie
-- weszła. Bierzemy z niej DWIE funkcje i DWIE polityki — bez reszty mostu
-- (wyzwalacze, synchronizacja historii), bo to osobna praca.
CREATE OR REPLACE FUNCTION public.normalize_pl_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '');
$$;

CREATE OR REPLACE FUNCTION public.current_user_pl_phone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.normalize_pl_phone(coalesce(u.raw_user_meta_data->>'phone', u.phone))
  FROM auth.users u WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.normalize_pl_phone(text)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_pl_phone()   FROM PUBLIC, anon;
-- `current_user_pl_phone` musi być wywoływalna przez zalogowanego, bo używa
-- jej polityka niżej. Zwraca WYŁĄCZNIE telefon wołającego, więc nie ma czego
-- z niej wyciągnąć o kimś innym.
GRANT EXECUTE ON FUNCTION public.current_user_pl_phone() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_pl_phone(text) TO service_role;

DROP POLICY IF EXISTS "Users can view ownership requests by their phone" ON public.client_vehicle_ownership_requests;
CREATE POLICY "Users can view ownership requests by their phone"
  ON public.client_vehicle_ownership_requests FOR SELECT TO authenticated
  USING (phone = public.current_user_pl_phone());

DROP POLICY IF EXISTS "Users can update ownership requests"      ON public.client_vehicle_ownership_requests;
DROP POLICY IF EXISTS "Users can update own ownership requests"  ON public.client_vehicle_ownership_requests;
CREATE POLICY "Users can update own ownership requests"
  ON public.client_vehicle_ownership_requests FOR UPDATE TO authenticated
  USING (phone = public.current_user_pl_phone());

-- ---------------------------------------------------------------------------
-- 3. DZIENNIK ZDARZEŃ — zalogowany może dopisać, nikt z ulicy
-- ---------------------------------------------------------------------------
-- `InvoiceEditor` dopisuje stąd wpis przy zmianie faktury, więc polityka nie
-- może zniknąć bez zamiennika. Ale podrabianie śladu przez niezalogowanego to
-- coś innego niż zapis własnego działania.
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
CREATE POLICY "Zalogowany dopisuje wlasny wpis" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. TABELE SYSTEMOWE — pisze je wyłącznie klucz serwisowy, który omija RLS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System inserts audit log"            ON public.ai_call_audit_log;
DROP POLICY IF EXISTS "Service role manages ai_guest_usage" ON public.ai_guest_usage;
DROP POLICY IF EXISTS "System can insert coin transactions" ON public.coin_transactions;
DROP POLICY IF EXISTS "Insert ksef alerts"                  ON public.ksef_monitor_alerts;
DROP POLICY IF EXISTS "Insert ksef scans"                   ON public.ksef_monitor_scans;
DROP POLICY IF EXISTS "System can insert voice cache"       ON public.voice_phrase_cache;
DROP POLICY IF EXISTS "System inserts history"              ON public.workspace_task_history;
DROP POLICY IF EXISTS "Authenticated users can insert listing numbers" ON public.universal_listing_numbers;

COMMIT;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM, W OSOBNEJ TRANSAKCJI, WYCOFANA
-- ---------------------------------------------------------------------------
-- Osobna transakcja, bo sprawdza stan PO zatwierdzeniu. Wycofana, bo dosiewa
-- wiersze próbne.
BEGIN;

DO $KONIEC$
DECLARE
  v_ile   int;
  v_slot  uuid;
  v_owner uuid;
  v_opis  text;
BEGIN
  INSERT INTO viewing_slots DEFAULT VALUES RETURNING id INTO v_slot;
  INSERT INTO client_vehicle_ownership_requests (phone) VALUES ('600000000') RETURNING id INTO v_owner;

  SET LOCAL ROLE anon;

  -- (a) KONTROLA POZYTYWNA — bez niej każda „odmowa" niżej mogłaby brać się
  --     z zepsutego podkładu, a nie z polityk.
  SELECT count(*) INTO v_ile FROM car_brands;
  IF v_ile = 0 THEN
    RAISE EXCEPTION 'Kontrola pozytywna padla: anon nie widzi nawet slownika marek';
  END IF;

  -- (b) Terminy ogladania zamkniete w obie strony.
  SELECT count(*) INTO v_ile FROM viewing_slots;
  IF v_ile > 0 THEN RAISE EXCEPTION 'anon NADAL czyta terminy ogladania (% wierszy)', v_ile; END IF;

  UPDATE viewing_slots SET status = 'x' WHERE id = v_slot;
  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN RAISE EXCEPTION 'anon NADAL zmienia terminy ogladania'; END IF;

  -- (c) Dziennik zdarzen zamkniety dla niezalogowanego. Rozstrzyga SQLSTATE:
  --     42501 to odmowa, cokolwiek innego znaczy, ze polityka przepuscila.
  BEGIN
    INSERT INTO audit_log (action) VALUES ('kontrola');
    RAISE EXCEPTION 'anon NADAL dopisuje do audit_log';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- (d) Ksiega monet zamknieta.
  BEGIN
    INSERT INTO coin_transactions (user_id, amount, type, source)
    VALUES (gen_random_uuid(), 1, 'x', 'x');
    RAISE EXCEPTION 'anon NADAL dopisuje do coin_transactions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  SET LOCAL ROLE authenticated;

  -- (e) Obcy zalogowany (bez tozsamosci, wiec `auth.uid()` = NULL) nie widzi
  --     i nie rusza cudzych przeniesien wlasnosci.
  SELECT count(*) INTO v_ile FROM client_vehicle_ownership_requests;
  IF v_ile > 0 THEN RAISE EXCEPTION 'obcy zalogowany NADAL czyta przeniesienia wlasnosci'; END IF;

  UPDATE client_vehicle_ownership_requests SET phone = '111111111' WHERE id = v_owner;
  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN RAISE EXCEPTION 'obcy zalogowany NADAL zmienia przeniesienia wlasnosci'; END IF;

  RESET ROLE;

  -- (f) ZAMIATARKA. Powyzsze sprawdza cztery tabele z nazwy — a literowka
  --     w nazwie polityki sprawia, ze `DROP POLICY IF EXISTS` NIC nie robi
  --     i dziura zostaje otwarta bez zadnego bledu. To pytanie o stan, nie
  --     o nasze intencje: czy ZOSTALA jakakolwiek otwarta polityka zapisu
  --     osiagalna bez zalogowania.
  --
  --     Trzy publiczne formularze sa wypisane z nazwy jako swiadomy wyjatek:
  --     rezerwacje i zgloszenia sklada ktos, kto nie ma konta.
  SELECT count(*) INTO v_ile
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND cmd <> 'SELECT'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
    AND coalesce(qual::text, 'true') = 'true'
    AND coalesce(with_check::text, 'true') = 'true'
    AND tablename NOT IN ('service_bookings', 'service_provider_requests',
                          'real_estate_listing_interactions');
  IF v_ile > 0 THEN
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_opis
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE' AND cmd <> 'SELECT'
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
      AND coalesce(qual::text, 'true') = 'true'
      AND coalesce(with_check::text, 'true') = 'true'
      AND tablename NOT IN ('service_bookings', 'service_provider_requests',
                            'real_estate_listing_interactions');
    RAISE EXCEPTION 'Zostaly otwarte polityki zapisu dla anon: %', v_opis;
  END IF;

  RAISE NOTICE 'Zamkniete: terminy ogladania, przeniesienia wlasnosci, dziennik zdarzen, ksiega monet i szesc tabel systemowych. Otwartych polityk zapisu dla anon poza trzema formularzami: 0.';
END $KONIEC$;

ROLLBACK;

NOTIFY pgrst, 'reload schema';

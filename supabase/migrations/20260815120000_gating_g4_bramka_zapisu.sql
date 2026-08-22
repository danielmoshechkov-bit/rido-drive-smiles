-- G4 — bramka zapisu i widoczności publicznej dla linii produktowych.
--
-- ZASADA NACZELNA: odczyt zostaje otwarty. Eksport ma działać w każdym stanie
-- subskrypcji — to warunek, nie uprzejmość. Blokujemy INSERT/UPDATE/DELETE.
--
-- Polityki zapisu są RESTRICTIVE. To istotne: polityki PERMISSIVE łączą się
-- przez OR, więc dołożenie kolejnej niczego by nie zabroniło. RESTRICTIVE łączy
-- się przez AND, dzięki czemu nie trzeba dotykać żadnej istniejącej polityki.
--
-- service_role omija RLS w całości — edge functions działają jak dotąd. Ich
-- własna bramka to G5.

-- ---------------------------------------------------------------------------
-- 1. Funkcje decyzyjne
-- ---------------------------------------------------------------------------

-- Parametr `p_linia` zamiast zaszytego 'warsztat': panel usługodawcy ma kiedyś
-- być osobnym produktem i wtedy ma wystarczyć dodanie planu w panelu, bez
-- zmiany kodu SQL.
CREATE OR REPLACE FUNCTION public.moze_pracowac(p_provider uuid, p_linia text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text; v_user uuid; v_trial timestamptz; v_ma_trial boolean;
BEGIN
  IF p_provider IS NULL OR p_linia IS NULL THEN
    RETURN false;                      -- brak podmiotu = brak zgody (fail-closed)
  END IF;

  SELECT status INTO v_status
  FROM billing_subscriptions
  WHERE subscriber_type = 'service_provider'
    AND subscriber_id   = p_provider
    -- `product_line` jest typem wyliczeniowym `billing_product_line`, a parametr
    -- przychodzi jako `text` — bez rzutowania Postgres nie ma operatora
    -- `billing_product_line = text` i całe zapytanie pada.
    --
    -- Rzutujemy KOLUMNĘ na tekst, nie parametr na typ wyliczeniowy. Rzutowanie
    -- parametru wywalałoby się wyjątkiem przy nieznanej nazwie linii, a ta
    -- funkcja stoi w politykach RLS: wyjątek przerwałby każde zapytanie do
    -- tabeli. Porównanie tekstowe przy nieznanej nazwie po prostu nic nie
    -- znajdzie i skończy się odmową — czyli fail-closed, tak jak reszta.
    AND product_line::text = p_linia
  ORDER BY created_at DESC LIMIT 1;

  -- Subskrypcja płatna ma pierwszeństwo. 'past_due' PRZEPUSZCZA: to okres
  -- karencji, w którym operator sam ponawia pobranie i połowa nieudanych
  -- płatności naprawia się bez udziału klienta.
  IF v_status IS NOT NULL THEN
    RETURN v_status IN ('active', 'trialing', 'past_due');
  END IF;

  -- Brak subskrypcji płatnej — decyduje okres próbny właściciela.
  SELECT user_id INTO v_user FROM service_providers WHERE id = p_provider;
  IF v_user IS NULL THEN RETURN false; END IF;

  -- Świadomie NIE filtrujemy po metadata->>'module'. `activate-workshop-trial`
  -- sprawdza istnienie triala BEZ filtra — dla niego jeden wiersz na konto
  -- znaczy „ten użytkownik ma już okres próbny". Filtrowanie tutaj rozjechałoby
  -- się z zapisem: komuś odmówiono by drugiego triala, a pierwszy nie dawałby
  -- mu dostępu. Przy przyznawaniu dostępu jesteśmy hojni; przy odbieraniu
  -- widoczności publicznej (patrz `jest_klientem_linii`) — ostrożni.
  SELECT expires_at, true INTO v_trial, v_ma_trial
  FROM paid_service_subscriptions
  WHERE user_id = v_user AND status = 'trial'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT COALESCE(v_ma_trial, false) THEN RETURN false; END IF;

  -- Trial bez daty końca = trwający. Taki wiersz powstał przed wprowadzeniem
  -- terminów; odebranie mu dostępu byłoby zmianą warunków wstecz.
  RETURN v_trial IS NULL OR v_trial > now();
END;
$$;

-- Czy ten podmiot w ogóle JEST klientem tej linii. Używane wyłącznie do
-- odbierania widoczności publicznej, dlatego wymaga sygnału wprost: bez tego
-- każdy usługodawca spoza warsztatów (fryzjer, kosmetyczka) zniknąłby z giełdy
-- usług, bo nigdy nie miał subskrypcji warsztatowej.
CREATE OR REPLACE FUNCTION public.jest_klientem_linii(p_provider uuid, p_linia text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM billing_subscriptions
    WHERE subscriber_type = 'service_provider'
      AND subscriber_id   = p_provider
      -- `product_line` jest typem wyliczeniowym `billing_product_line`, a parametr
    -- przychodzi jako `text` — bez rzutowania Postgres nie ma operatora
    -- `billing_product_line = text` i całe zapytanie pada.
    --
    -- Rzutujemy KOLUMNĘ na tekst, nie parametr na typ wyliczeniowy. Rzutowanie
    -- parametru wywalałoby się wyjątkiem przy nieznanej nazwie linii, a ta
    -- funkcja stoi w politykach RLS: wyjątek przerwałby każde zapytanie do
    -- tabeli. Porównanie tekstowe przy nieznanej nazwie po prostu nic nie
    -- znajdzie i skończy się odmową — czyli fail-closed, tak jak reszta.
    AND product_line::text = p_linia
  ) OR EXISTS (
    SELECT 1
    FROM paid_service_subscriptions ps
    JOIN service_providers sp ON sp.user_id = ps.user_id
    WHERE sp.id = p_provider
      AND ps.metadata ->> 'module' = p_linia
  );
$$;

REVOKE ALL ON FUNCTION public.moze_pracowac(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jest_klientem_linii(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moze_pracowac(uuid, text)       TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.jest_klientem_linii(uuid, text) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Bramka zapisu na tabelach warsztatowych
-- ---------------------------------------------------------------------------
-- Lista tabel jako funkcje, a nie literały w bloku DO. Migracja G0 przebudowuje
-- te same polityki, dokładając furtkę serwisową dla administratora — a dwie
-- kopie listy trzydziestu tabel rozjechałyby się przy pierwszej nowej tabeli.
CREATE OR REPLACE FUNCTION public.warsztat_tabele_wprost()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'workshop_orders', 'workshop_clients', 'workshop_vehicles',
    'workshop_cash_closures', 'workshop_expenses', 'workshop_recurring_costs',
    'workshop_finance_settings', 'workshop_payments',
    'workshop_employees', 'workshop_employee_invitations',
    'workshop_employee_findings', 'workshop_employee_notifications',
    'workshop_employee_payouts', 'workshop_mechanics',
    'workshop_stations', 'workshop_station_employees', 'workshop_workstations',
    'workshop_service_points', 'workshop_tire_storage',
    'workshop_order_assignments', 'workshop_order_statuses',
    'workshop_status_settings', 'workshop_order_sequences',
    'workshop_parts_integrations', 'workshop_parts_orders'
  ];
$$;

CREATE OR REPLACE FUNCTION public.warsztat_tabele_przez_zlecenie()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'workshop_order_items', 'workshop_order_files',
    'workshop_order_photos', 'workshop_order_signatures'
  ];
$$;

-- Zakłada polityki zapisu na wszystkich tabelach warsztatowych.
-- `p_dodatkowy_warunek` doklejamy przez OR — G0 wstawia tam furtkę serwisową.
CREATE OR REPLACE PROCEDURE public.warsztat_zaloz_bramke(p_dodatkowy_warunek text DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  t text; warunek text;
  przez_zlecenie text[] := public.warsztat_tabele_przez_zlecenie();
BEGIN
  FOREACH t IN ARRAY public.warsztat_tabele_wprost() || przez_zlecenie LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'pomijam % — brak tabeli', t; CONTINUE;
    END IF;

    IF t = ANY (przez_zlecenie) THEN
      warunek := 'public.moze_pracowac('
              || '(SELECT o.provider_id FROM public.workshop_orders o WHERE o.id = order_id), ''warsztat'')';
      IF p_dodatkowy_warunek IS NOT NULL THEN
        warunek := warunek || ' OR ' || replace(p_dodatkowy_warunek, '%KOLUMNA%',
          '(SELECT o.provider_id FROM public.workshop_orders o WHERE o.id = order_id)');
      END IF;
    ELSE
      warunek := 'public.moze_pracowac(provider_id, ''warsztat'')';
      IF p_dodatkowy_warunek IS NOT NULL THEN
        warunek := warunek || ' OR ' || replace(p_dodatkowy_warunek, '%KOLUMNA%', 'provider_id');
      END IF;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_delete', t);

    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (%s)',
      'warsztat_zapis_insert', t, warunek);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (%s) WITH CHECK (%s)',
      'warsztat_zapis_update', t, warunek, warunek);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (%s)',
      'warsztat_zapis_delete', t, warunek);

    RAISE NOTICE 'bramka zapisu: %', t;
  END LOOP;
END $$;

CALL public.warsztat_zaloz_bramke();

-- ---------------------------------------------------------------------------
-- 3. Rezerwacje — obsługa TAK, zakładanie nowych NIE
-- ---------------------------------------------------------------------------
--
-- Klient, który się umówił przed blokadą, ma zostać obsłużony: warsztat może
-- potwierdzić, odwołać, przełożyć i oznaczyć rezerwację jako zrealizowaną.
-- Nie może natomiast wpisać nowego terminu, bo to już jest praca.
--
-- Blokujemy WYŁĄCZNIE INSERT i wyłącznie na workshop_client_bookings, gdzie
-- jedynym nie-serwisowym wpisującym jest sam warsztat (WorkshopScheduler).
-- Klient końcowy nigdy nie pisze do tej tabeli wprost — jego ścieżka `/r/:token`
-- idzie przez funkcje SECURITY DEFINER, które omijają RLS i działają dalej.
--
-- `service_bookings` zostaje NIETKNIĘTE. Tam INSERT robi klient końcowy
-- (formularz rezerwacji z giełdy usług), a UPDATE — warsztat obsługujący
-- zgłoszenie. Zablokowanie któregokolwiek uderzyłoby w osobę trzecią, która
-- nic nie zawiniła, i zerwałoby rezerwację w połowie.
DROP POLICY IF EXISTS warsztat_zapis_insert ON public.workshop_client_bookings;
CREATE POLICY warsztat_zapis_insert ON public.workshop_client_bookings
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (public.moze_pracowac(provider_id, 'warsztat'));

-- ---------------------------------------------------------------------------
-- 4. Widoczność publiczna
-- ---------------------------------------------------------------------------
--
-- Warsztat bez opłaty znika z wyszukiwarki i z własnej karty publicznej: klient
-- go nie znajdzie i nie umówi się na nowy termin.
--
-- Kolumny `status` NIE dotykamy. Widoczność wynika z zapytania, nie z zapisu,
-- więc po zaksięgowaniu płatności warsztat wraca do stanu SPRZED blokady —
-- 'active' zostaje 'active', 'verified' zostaje 'verified'. Nadpisanie statusu
-- wymagałoby pamiętania poprzedniej wartości i przy odtwarzaniu wrzuciłoby
-- wszystkich do jednego domyślnego stanu.
--
-- `jest_klientem_linii` chroni usługodawców spoza warsztatów: kto nigdy nie był
-- klientem tej linii, ten nie podlega jej bramce.
DROP POLICY IF EXISTS "Active providers are public" ON public.service_providers;
CREATE POLICY "Active providers are public"
ON public.service_providers FOR SELECT
USING (
  (
    status IN ('active', 'verified')
    AND (
      NOT public.jest_klientem_linii(id, 'warsztat')
      OR public.moze_pracowac(id, 'warsztat')
    )
  )
  OR user_id = auth.uid()
);

-- Te dwie polityki i tak pytają o `service_providers`, więc dziedziczą powyższe
-- przez RLS tabeli nadrzędnej. Powtarzamy warunek wprost, żeby widoczność usług
-- nie zależała od subtelności kaskadowania polityk.
DROP POLICY IF EXISTS "Active services are public" ON public.services;
CREATE POLICY "Active services are public"
ON public.services FOR SELECT
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = services.provider_id
      AND sp.status IN ('active', 'verified')
      AND (NOT public.jest_klientem_linii(sp.id, 'warsztat')
           OR public.moze_pracowac(sp.id, 'warsztat'))
  )
);

DROP POLICY IF EXISTS "Active provider categories are public" ON public.provider_service_categories;
CREATE POLICY "Active provider categories are public"
ON public.provider_service_categories FOR SELECT
USING (
  COALESCE(is_active, true) = true
  AND EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = provider_service_categories.provider_id
      AND sp.status IN ('active', 'verified')
      AND (NOT public.jest_klientem_linii(sp.id, 'warsztat')
           OR public.moze_pracowac(sp.id, 'warsztat'))
  )
);

NOTIFY pgrst, 'reload schema';

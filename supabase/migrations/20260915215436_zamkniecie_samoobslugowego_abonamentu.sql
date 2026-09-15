-- ═══════════════════════════════════════════════════════════════════════════
-- ZAMKNIĘCIE SAMOOBSŁUGOWEGO ABONAMENTU (15.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CO BYŁO OTWARTE
--
-- Polityka „Users can create their own subscriptions" na
-- `paid_service_subscriptions` pozwalała KAŻDEMU zalogowanemu wpisać sobie
-- własny abonament: `INSERT WITH CHECK (user_id = auth.uid())`.
--
-- To nie było odblokowanie samego interfejsu. Funkcja `moze_pracowac` — ta,
-- która stoi w politykach RLS i w bramce funkcji brzegowych — przy braku
-- wiersza w `billing_subscriptions` sięga po okres próbny właściciela
-- WŁAŚNIE do tej tabeli. Sprawdzone zachowaniem, jako rola `authenticated`
-- z prawdziwym `auth.uid()`, w transakcji wycofanej wyjątkiem:
--
--   [0] stan zastany:                          moze_pracowac = true
--   [1] po usunięciu okresu próbnego:          moze_pracowac = false   ← kontrola
--   [3] własny zapis triala do 2099:           PRZESZŁO, wierszy = 1
--   [4] po własnym zapisie:                    moze_pracowac = true
--
-- I drugi przebieg — czy da się to powtórzyć po wygaśnięciu:
--
--   [1] trial przestawiony na wygasły:         moze_pracowac = false
--   [2] UPDATE istniejącego wiersza:           wierszy = 0 (RLS odfiltrowało)
--   [3] DRUGI wiersz obok wygasłego:           PRZESZŁO, wierszy = 1
--   [4] po dołożeniu drugiego wiersza:         moze_pracowac = true
--
-- Czyli: nieograniczony dostęp, odnawialny jednym żądaniem z przeglądarki,
-- bez zakładania drugiego konta. Front czyta `order by created_at desc limit 1`,
-- więc najnowszy wiersz wygrywa.
--
-- To samo w drugim module: `ai_pro_subscriptions` ma politykę ALL dla
-- właściciela encji, a okres próbny zapisuje `useAIPro.startTrial` wprost
-- z przeglądarki (`trial_ends_at` z ciała żądania). Próba wpisania triala
-- do 2099 PRZESZŁA. Tabela jest dziś pusta — zamykamy, zanim nie będzie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO TO NICZEGO NIE ZEPSUJE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `paid_service_subscriptions`:
--   • front WYŁĄCZNIE czyta (`useSubscriptionAccess`) — polityka SELECT zostaje,
--   • panel administratora działa na polityce „Admins can manage all subscriptions",
--   • jedyne zapisy to `activate-workshop-trial` i `register-marketplace-user`,
--     obie kluczem serwisowym — a `service_role` OMIJA RLS.
--
-- `ai_pro_subscriptions`:
--   • odczyt zostaje (polityka „Users can view their entity AI PRO subscriptions"),
--   • nadawanie dostępu zostaje przy administratorze (`AIProManagementPanel`),
--   • samoobsługowe uruchomienie triala z przeglądarki znika — i to jest cel.
--
-- Czego ta migracja NIE rusza: polityki „Users can create own provider" na
-- `service_providers`. Ona jest w użyciu (`ServiceRegistrationModal` zakłada
-- warsztat z przeglądarki). Jej skutek uboczny — jeden wiersz okresu próbnego
-- otwiera WSZYSTKIE warsztaty konta, bo `moze_pracowac` pyta o okres próbny
-- właściciela — jest opisany w STAN-PRAC i czeka na decyzję. Dziś każde konto
-- ma dokładnie jeden warsztat (31 z 31), więc zmiana byłaby bez skutku na
-- danych, a rusza funkcję stojącą w politykach RLS. Osobna migracja, świadomie.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── KONTROLA WSTĘPNA ──────────────────────────────────────────────────────
-- Migracja ma wiedzieć, że zastaje stan, który opisuje. Jeśli polityki już
-- nie ma, ktoś ruszył to przede mną i dalsze kroki mogą znaczyć co innego.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='paid_service_subscriptions'
      AND policyname='Users can create their own subscriptions'
  ) THEN
    RAISE EXCEPTION 'Nie zastałem polityki INSERT na paid_service_subscriptions — stan inny niż opisany w nagłówku. Zatrzymuję.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_pro_subscriptions'
      AND policyname='Users can manage their entity AI PRO subscriptions'
  ) THEN
    RAISE EXCEPTION 'Nie zastałem polityki ALL na ai_pro_subscriptions — stan inny niż opisany w nagłówku. Zatrzymuję.';
  END IF;
END $$;

-- ── ZMIANA ────────────────────────────────────────────────────────────────
DROP POLICY "Users can create their own subscriptions" ON public.paid_service_subscriptions;
DROP POLICY "Users can manage their entity AI PRO subscriptions" ON public.ai_pro_subscriptions;

COMMENT ON TABLE public.paid_service_subscriptions IS
  'Okresy próbne i abonamenty usług. ZAPIS WYŁĄCZNIE KLUCZEM SERWISOWYM '
  '(activate-workshop-trial, register-marketplace-user) albo przez administratora. '
  'Polityka INSERT dla zalogowanych zdjęta 15.09.2026: pozwalała wpisać sobie '
  'abonament z przeglądarki, a moze_pracowac() czyta tę tabelę jako źródło dostępu.';

COMMENT ON TABLE public.ai_pro_subscriptions IS
  'Dostęp do AI PRO. Zalogowany właściciel encji tylko CZYTA. Nadawanie — '
  'administrator (AIProManagementPanel). Polityka ALL zdjęta 15.09.2026: '
  'pozwalała uruchomić sobie okres próbny z dowolną datą końca.';

-- ── KONTROLA PO ZMIANIE ───────────────────────────────────────────────────
-- Dwa kierunki, oba obowiązkowe:
--   • kontrola pozytywna — zapis, o którym wiadomo, że jest zły, MA zostać odrzucony,
--   • kontrola odwrotna  — odczyt, który ma działać, NADAL działa.
-- Bez tej drugiej „same odmowy" znaczyłyby tylko tyle, że podkład jest zepsuty
-- i baza odmawia wszystkiego (patrz CLAUDE.md, „test RLS musi zawierać
-- przypadek, który ma PRZEJŚĆ").
DO $$
DECLARE
  v_user uuid;
  v_entity_owner uuid;
  v_n integer;
  v_przeszlo boolean := false;
BEGIN
  SELECT user_id INTO v_user FROM paid_service_subscriptions WHERE user_id IS NOT NULL LIMIT 1;
  SELECT owner_user_id INTO v_entity_owner FROM entities WHERE owner_user_id IS NOT NULL LIMIT 1;
  IF v_user IS NULL OR v_entity_owner IS NULL THEN
    RAISE EXCEPTION 'Brak danych do kontroli (użytkownik z abonamentem / właściciel encji). Zatrzymuję — kontrola bez podkładu nic nie znaczy.';
  END IF;

  -- ═══ paid_service_subscriptions ═══
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF auth.uid() IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Kontrola nieważna: auth.uid() = %, oczekiwano %.', auth.uid(), v_user;
  END IF;

  -- kontrola odwrotna: własne wiersze nadal widoczne
  SELECT count(*) INTO v_n FROM paid_service_subscriptions WHERE user_id = v_user;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Kontrola odwrotna PADŁA: zalogowany nie widzi własnego abonamentu. Zdjęto za dużo.';
  END IF;

  -- kontrola pozytywna: własny zapis MA być odrzucony
  BEGIN
    INSERT INTO paid_service_subscriptions (user_id, status, started_at, expires_at, amount_paid)
    VALUES (v_user, 'trial', now(), '2099-01-01', 0);
    v_przeszlo := true;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- 42501 — dokładnie o to chodzi
  END;
  IF v_przeszlo THEN
    RAISE EXCEPTION 'KONTROLA POZYTYWNA PADŁA: zalogowany NADAL wpisuje sobie abonament.';
  END IF;

  -- ═══ ai_pro_subscriptions ═══
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_entity_owner, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- kontrola odwrotna: własna encja nadal widoczna
  SELECT count(*) INTO v_n FROM entities WHERE owner_user_id = v_entity_owner;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Kontrola odwrotna PADŁA: właściciel nie widzi własnej encji.';
  END IF;

  v_przeszlo := false;
  BEGIN
    INSERT INTO ai_pro_subscriptions (entity_id, status, trial_started_at, trial_ends_at)
    SELECT id, 'trial_active', now(), '2099-01-01' FROM entities WHERE owner_user_id = v_entity_owner LIMIT 1;
    v_przeszlo := true;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF v_przeszlo THEN
    RAISE EXCEPTION 'KONTROLA POZYTYWNA PADŁA: właściciel encji NADAL uruchamia sobie okres próbny AI PRO.';
  END IF;

  EXECUTE 'RESET ROLE';

  -- Zapis kluczem serwisowym ma zostać możliwy — bez tego padłyby obie
  -- funkcje brzegowe zakładające okres próbny. `service_role` omija RLS,
  -- ale bez nadania na tabeli nie wykona nawet INSERT-a.
  IF NOT has_table_privilege('service_role', 'public.paid_service_subscriptions', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.ai_pro_subscriptions', 'INSERT') THEN
    RAISE EXCEPTION 'service_role stracił prawo zapisu — funkcje brzegowe przestałyby zakładać okres próbny.';
  END IF;

  RAISE NOTICE '✅ Zapis z przeglądarki zamknięty w obu tabelach; odczyt i klucz serwisowy nietknięte.';
END $$;

COMMIT;

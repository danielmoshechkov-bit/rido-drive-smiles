-- Nadanie kredytów z panelu administratora trafia tam, gdzie liczniki patrzą.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 OBJAW: PANEL MELDUJE SUKCES, KREDYTY NIE DOCHODZĄ
-- ═══════════════════════════════════════════════════════════════════════════
-- Administrator wskazuje konto, wybiera typ, podaje liczbę, klika. Panel mówi
-- „Przyznano 50 kredytów". Na koncie nie przybywa nic.
--
-- Przyczyną NIE jest odcięcie ról `anon`/`authenticated` migracją
-- `20260822185000` — sprawdzone: panel woła funkcję brzegową `payment-core`,
-- ta trzyma klucz serwisowy, a rola administratora czytana z `drivers.user_role`
-- przechodzi poprawnie. Wywołanie dochodzi do końca i zwraca `{ ok: true }`.
--
-- Przyczyną jest MIEJSCE ZAPISU. `handleAdminGrant` pisze do tabel, których
-- nikt już nie czyta:
--
--   credit_type = 'vehicle_lookup'  → `vehicle_lookup_credits`   (stara)
--   cokolwiek innego                → `user_credits.credits_balance` (martwa)
--
-- A liczniki czytają `check_usage`: pula z planu plus paczki
-- z `billing_addon_packs`. Nadanie i odczyt patrzyły w dwa różne miejsca.
--
-- Ślad na produkcji, zmierzony 10.09.2026:
--   09:32 i 09:58 — po 50 sztuk w `vehicle_lookup_credit_transactions`
--   09.09 08:33   — 20 sztuk tamże
--   09.09 09:50   — 20 w `user_credits.credits_balance` (typ zgubiony,
--                   bo ta tabela ma JEDNO nietypowane saldo)
-- Na koncie `bf7c8a4b…` nie pojawiło się z tego nic.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO OSOBNA FUNKCJA, A NIE `INSERT` Z FUNKCJI BRZEGOWEJ
-- ═══════════════════════════════════════════════════════════════════════════
-- Paczka to wiersz w tabeli pieniężnej. Gdy zakłada ją funkcja brzegowa gołym
-- `INSERT`-em, każda przyszła zmiana zasad (termin ważności, ewidencja, limit
-- na nadanie) wymaga wdrożenia funkcji brzegowej i rozjeżdża się z pozostałymi
-- drogami nadania. Tu reguła stoi w jednym miejscu, tak jak `grant_sms_credits`.
--
-- SMS-y celowo NIE przechodzą przez tę funkcję. Mają własną,
-- `grant_sms_credits`, która zapisuje paczkę I wiersz księgi w jednej
-- transakcji. Dwie drogi do jednego salda to dokładnie ten rozjazd, który
-- w sierpniu dał 60 SMS-ów przy 30 w księdze.

BEGIN;

CREATE OR REPLACE FUNCTION public.nadaj_paczke_admin(
  p_provider_id uuid,
  p_cecha       text,
  p_ile         integer,
  p_actor       uuid DEFAULT NULL,
  p_opis        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cecha uuid;
  v_rodzaj text;
  v_id uuid;
BEGIN
  IF p_provider_id IS NULL THEN
    RAISE EXCEPTION 'BRAK_WARSZTATU' USING HINT = 'Paczka wisi przy warsztacie, nie przy koncie.';
  END IF;
  IF coalesce(p_ile, 0) <= 0 THEN
    RAISE EXCEPTION 'ZLA_ILOSC' USING HINT = 'Liczba sztuk musi byc dodatnia.';
  END IF;

  -- SMS-y maja wlasna droge. Odmowa jest tu celowa: dwie drogi do jednego
  -- salda rozjezdzaja sie predzej czy pozniej.
  IF p_cecha = 'sms' THEN
    RAISE EXCEPTION 'SMS_MA_WLASNA_DROGE' USING HINT = 'Uzyj grant_sms_credits — zapisuje takze ksiege.';
  END IF;

  SELECT id, kind::text INTO v_cecha, v_rodzaj
  FROM billing_features WHERE key = p_cecha AND is_active;

  IF v_cecha IS NULL THEN
    RAISE EXCEPTION 'NIEZNANA_CECHA: %', p_cecha
      USING HINT = 'Nadawac mozna wylacznie istniejaca, aktywna ceche rozliczeniowa.';
  END IF;

  -- Cecha wlaczana/wylaczana (`boolean`) nie ma sztuk — paczka nie ma sensu
  -- i nikt by jej nie odczytal. Odmawiamy zamiast zakladac martwy wiersz.
  IF v_rodzaj <> 'metered' THEN
    RAISE EXCEPTION 'CECHA_BEZ_SZTUK: %', p_cecha
      USING HINT = 'Ta cecha jest wlaczana w planie, a nie liczona na sztuki.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM service_providers WHERE id = p_provider_id) THEN
    RAISE EXCEPTION 'NIEZNANY_WARSZTAT';
  END IF;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  VALUES ('service_provider', p_provider_id, v_cecha, p_ile, p_ile,
          NULL, 'admin_grant',
          coalesce(nullif(btrim(p_opis), ''), 'Nadanie z panelu administratora')
            || coalesce(' (autor: ' || p_actor::text || ')', ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- `FROM PUBLIC, anon, authenticated` — samo `FROM public` NIE odbiera jawnych
-- nadan, ktore Supabase robi dla obu tych rol. Ta funkcja zaklada jednostki
-- warte pieniadze i ma byc osiagalna wylacznie kluczem serwisowym.
REVOKE ALL ON FUNCTION public.nadaj_paczke_admin(uuid, text, integer, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nadaj_paczke_admin(uuid, text, integer, uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM
-- ---------------------------------------------------------------------------
DO $KONIEC$
DECLARE
  v_prov uuid;
  v_pack uuid;
  v_przed numeric;
  v_po    numeric;
  v_udalo boolean;
BEGIN
  SELECT id INTO v_prov FROM service_providers ORDER BY created_at LIMIT 1;
  IF v_prov IS NULL THEN
    RAISE EXCEPTION 'Brak jakiegokolwiek warsztatu — nie mam na czym sprawdzic zachowania';
  END IF;

  SELECT coalesce(sum(amount_remaining), 0) INTO v_przed
  FROM billing_addon_packs p JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_id = v_prov AND f.key = 'vehicle_lookup';

  -- (a) KONTROLA POZYTYWNA: nadanie MA sie udac i MA byc widoczne tam,
  --     gdzie patrza liczniki. Bez tego test przechodzilby takze wtedy,
  --     gdyby funkcja odmawiala wszystkiego.
  v_pack := nadaj_paczke_admin(v_prov, 'vehicle_lookup', 7, NULL, 'KONTROLA MIGRACJI');

  SELECT coalesce(sum(amount_remaining), 0) INTO v_po
  FROM billing_addon_packs p JOIN billing_features f ON f.id = p.feature_id
  WHERE p.subscriber_id = v_prov AND f.key = 'vehicle_lookup';

  IF v_po - v_przed <> 7 THEN
    DELETE FROM billing_addon_packs WHERE id = v_pack;
    RAISE EXCEPTION 'Nadanie nie doszlo do paczek: przed %, po % (roznica %)', v_przed, v_po, v_po - v_przed;
  END IF;

  DELETE FROM billing_addon_packs WHERE id = v_pack;

  -- (b) SMS-y odbite — maja wlasna droge.
  v_udalo := true;
  BEGIN PERFORM nadaj_paczke_admin(v_prov, 'sms', 5);
  EXCEPTION WHEN others THEN v_udalo := false; END;
  IF v_udalo THEN RAISE EXCEPTION 'SMS-y przeszly ta droga — beda dwa zrodla jednego salda'; END IF;

  -- (c) Cecha wlaczana/wylaczana odbita.
  v_udalo := true;
  BEGIN PERFORM nadaj_paczke_admin(v_prov, 'ksef', 5);
  EXCEPTION WHEN others THEN v_udalo := false; END;
  IF v_udalo THEN RAISE EXCEPTION 'Cecha boolean przeszla — powstalaby paczka, ktorej nikt nie czyta'; END IF;

  -- (d) Nieistniejaca cecha odbita. Panel oferowal `ai`, `ai_photo`
  --     i `listing_featured` — zadna z nich nie jest cecha rozliczeniowa.
  v_udalo := true;
  BEGIN PERFORM nadaj_paczke_admin(v_prov, 'ai_photo', 5);
  EXCEPTION WHEN others THEN v_udalo := false; END;
  IF v_udalo THEN RAISE EXCEPTION 'Nieistniejaca cecha przeszla'; END IF;

  -- (e) Zerowa i ujemna liczba odbita.
  v_udalo := true;
  BEGIN PERFORM nadaj_paczke_admin(v_prov, 'vehicle_lookup', 0);
  EXCEPTION WHEN others THEN v_udalo := false; END;
  IF v_udalo THEN RAISE EXCEPTION 'Nadanie zera przeszlo'; END IF;

  -- (f) Uprawnienia: `authenticated` NIE MOZE tego wolac.
  IF has_function_privilege('authenticated',
       'public.nadaj_paczke_admin(uuid, text, integer, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ma EXECUTE na nadaj_paczke_admin — otwarta droga do darmowych jednostek';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.nadaj_paczke_admin(uuid, text, integer, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role nie ma EXECUTE — funkcja brzegowa jej nie zawola';
  END IF;

  RAISE NOTICE 'nadaj_paczke_admin: nadanie widoczne w paczkach, SMS/boolean/nieznane/zero odbite, anon i authenticated odciete.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';

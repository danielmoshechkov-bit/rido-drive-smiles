-- 🔴 KRYTYCZNE: siedemnaście funkcji zmieniających salda było wywoływalnych
-- przez klienta — dwanaście z nich nawet BEZ ZALOGOWANIA.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ DZIAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- Zamknęliśmy tabele: `billing_addon_packs`, `sms_credit_ledger`, `user_wallets`,
-- `vehicle_lookup_credits`, `referral_uses` nie mają ŻADNEJ polityki zapisu dla
-- klienta. Sprawdzone — i to jest prawda.
--
-- Ale funkcje `SECURITY DEFINER` omijają RLS z definicji, bo działają jako
-- właściciel. A Supabase nadaje `EXECUTE` rolom `anon` i `authenticated`
-- automatycznie, dla KAŻDEJ funkcji w schemacie `public`.
--
-- Pisaliśmy `REVOKE ALL ON FUNCTION ... FROM public` i uznawaliśmy sprawę za
-- zamkniętą. `PUBLIC` w PostgreSQL to jednak osobne uprawnienie domyślne —
-- odebranie go NIE RUSZA jawnych nadań dla `anon` i `authenticated`. Linijka
-- wyglądała jak zamknięcie i nim nie była.
--
-- Sprawdzone ZACHOWANIEM, nie odczytem uprawnień: w transakcji z wycofaniem,
-- jako rola `authenticated`, wykonały się `credit_welcome_bonus`,
-- `billing_zejdz_do_read_only` i `billing_konczy_sie_trial`. `grant_sms_credits`
-- i `zwroc_sms_credit` też przeszły przez bramkę uprawnień — padły dopiero na
-- pustym identyfikatorze warsztatu, bo test nie miał sesji użytkownika.
--
-- Co to znaczy w praktyce:
--   • `credit_welcome_bonus(user_id, kwota)` — dopisanie sobie dowolnej kwoty,
--   • `grant_sms_credits(warsztat, ile, ...)` — dowolna liczba SMS-ów,
--   • `przyznaj_pakiet_startowy(...)` — pakiet startowy w kółko,
--   • `voice_nadaj_minuty(...)` — minuty agenta,
--   • `billing_zwrot(...)` — przeprowadzenie zwrotu,
--   • `billing_wydaj_paczke(zamowienie)` — wydanie paczki bez płatności,
--   • `complete_referral_on_first_purchase(...)` — prowizja z programu poleceń,
--     który zamknęliśmy NA POZIOMIE TABELI, zostawiając otwartą funkcję,
--   • `billing_zejdz_do_read_only()`, `billing_konczy_sie_trial()`,
--     `sms_wygas_paczki()` — masowa zmiana stanu cudzych kont.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POPRAWKA
-- ═══════════════════════════════════════════════════════════════════════════
-- `REVOKE ... FROM PUBLIC, anon, authenticated` — wymienione WPROST, bo tylko
-- to odbiera jawne nadania. Wołają je wyłącznie funkcje brzegowe na kluczu
-- serwisowym i zadania cykliczne; `service_role` zachowuje dostęp.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- JEDEN WYJĄTEK, ŚWIADOMY
-- ═══════════════════════════════════════════════════════════════════════════
-- `billing_consume` zostaje wywoływalne przez `authenticated`, bo woła je FRONT
-- (`src/lib/ridoAi.ts`, Rido Wycena). Odebranie tego teraz zgasiłoby działającą
-- funkcję bez uprzedzenia.
--
-- Odbieramy natomiast `anon`: niezalogowany nie ma po co zużywać cudzych
-- jednostek, a mógł — to była droga do wyzerowania konkurencji, nie do kradzieży.
--
-- Docelowo pobranie ma przenieść się do funkcji brzegowej, tak jak przy SMS-ach.
-- Dziś Rido Wycena pobiera jednostkę Z PRZEGLĄDARKI, PO otrzymaniu odpowiedzi —
-- czyli kto nie wykona tego wywołania, dostaje odpowiedź za darmo. To osobna
-- naprawa, w kodzie równoległej sesji.

BEGIN;

-- Szesnaście funkcji: odcięte od klienta w całości.
REVOKE ALL ON FUNCTION public.billing_konczy_sie_trial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_konczy_sie_trial() TO service_role;
REVOKE ALL ON FUNCTION public.billing_wydaj_paczke(p_order_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wydaj_paczke(p_order_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.billing_wygas_porzucone(p_godzin integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_wygas_porzucone(p_godzin integer) TO service_role;
REVOKE ALL ON FUNCTION public.billing_zejdz_do_read_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_zejdz_do_read_only() TO service_role;
REVOKE ALL ON FUNCTION public.billing_zwrot(p_order_id uuid, p_refund_id text, p_kwota_gr integer, p_typ text, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_zwrot(p_order_id uuid, p_refund_id text, p_kwota_gr integer, p_typ text, p_payload jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.complete_referral_on_first_purchase(p_referred_user_id uuid, p_order_amount_pln numeric, p_order_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_referral_on_first_purchase(p_referred_user_id uuid, p_order_amount_pln numeric, p_order_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.credit_welcome_bonus(p_user_id uuid, p_amount numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_welcome_bonus(p_user_id uuid, p_amount numeric) TO service_role;
REVOKE ALL ON FUNCTION public.demo_sms_zapisz(p_provider uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_sms_zapisz(p_provider uuid) TO service_role;
REVOKE ALL ON FUNCTION public.grant_sms_credits(p_provider_id uuid, p_ile integer, p_powod text, p_actor uuid, p_opis text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_sms_credits(p_provider_id uuid, p_ile integer, p_powod text, p_actor uuid, p_opis text) TO service_role;
REVOKE ALL ON FUNCTION public.link_referral_on_signup(p_referred_user_id uuid, p_code text, p_ip text, p_user_agent text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_referral_on_signup(p_referred_user_id uuid, p_code text, p_ip text, p_user_agent text) TO service_role;
REVOKE ALL ON FUNCTION public.onboarding_pojazd_za_darmo(p_provider uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_pojazd_za_darmo(p_provider uuid) TO service_role;
REVOKE ALL ON FUNCTION public.przyznaj_pakiet_startowy(p_user_id uuid, p_provider_id uuid, p_email text, p_sms integer, p_vin integer, p_rido_ai integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.przyznaj_pakiet_startowy(p_user_id uuid, p_provider_id uuid, p_email text, p_sms integer, p_vin integer, p_rido_ai integer) TO service_role;
REVOKE ALL ON FUNCTION public.sms_wygas_paczki() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_wygas_paczki() TO service_role;
REVOKE ALL ON FUNCTION public.voice_nadaj_minuty(p_provider_id uuid, p_minuty integer, p_powod text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_nadaj_minuty(p_provider_id uuid, p_minuty integer, p_powod text) TO service_role;
REVOKE ALL ON FUNCTION public.voice_wyzeruj_minuty(p_provider_id uuid, p_powod text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_wyzeruj_minuty(p_provider_id uuid, p_powod text) TO service_role;
REVOKE ALL ON FUNCTION public.zwroc_sms_credit(p_provider_id uuid, p_powod text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zwroc_sms_credit(p_provider_id uuid, p_powod text) TO service_role;

-- Wyjątek opisany wyżej: front go potrzebuje, `anon` nie.
REVOKE ALL ON FUNCTION public.billing_consume(p_subscriber_type billing_subscriber_type, p_subscriber_id uuid, p_feature_key text, p_amount numeric, p_pozwol_nadwyzke boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_consume(p_subscriber_type billing_subscriber_type, p_subscriber_id uuid, p_feature_key text, p_amount numeric, p_pozwol_nadwyzke boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Kontrola — po ZACHOWANIU uprawnień, nie po zapisie w migracji
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_otwarte text;
BEGIN
  SELECT string_agg(p.proname || ' (' ||
           CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon ' ELSE '' END ||
           CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated' ELSE '' END
         || ')', ', ')
    INTO v_otwarte
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND p.proname <> 'billing_consume'
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    AND p.prosrc ~* '(INSERT INTO|UPDATE)\s+(public\.)?(billing_addon_packs|billing_subscriptions|billing_orders|billing_usage|user_wallets|user_credits|vehicle_lookup_credits|sms_credit_ledger|referral_uses|workshop_onboarding_usage|coin_transactions|billing_plans)';

  IF v_otwarte IS NOT NULL THEN
    RAISE EXCEPTION 'Nadal wywoływalne przez klienta: %', v_otwarte;
  END IF;

  -- Kontrola pozytywna: `service_role` MUSI zachować dostęp, inaczej odcinamy
  -- funkcje brzegowe i zadania cykliczne razem z napastnikiem.
  IF NOT has_function_privilege('service_role',
        'public.grant_sms_credits(uuid,integer,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role stracil dostep do grant_sms_credits — funkcje brzegowe by padly';
  END IF;
  IF NOT has_function_privilege('authenticated',
        'public.billing_consume(billing_subscriber_type,uuid,text,numeric,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'front stracil dostep do billing_consume — Rido Wycena by padla';
  END IF;

  RAISE NOTICE 'Odciete od klienta. service_role i front zachowuja to, czego potrzebuja.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

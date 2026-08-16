-- Audyt: czy zalogowany klient z DevToolsami dopisze sobie pieniądze.
--
-- Każda próba wykonywana JAKO rola `authenticated` z ustawionym `auth.uid()`.
-- Wynik „PRZESZŁO" oznacza lukę.
--
-- ⚠️ PUŁAPKA, na którą już raz się nabrałem: przy UPDATE i DELETE polityka RLS
-- nie rzuca wyjątku, tylko FILTRUJE wiersze. Zapytanie kończy się sukcesem,
-- zmieniając zero wierszy. Dlatego sprawdzamy ROW_COUNT, a nie sam brak błędu.

\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION public._probuj(p_opis text, p_sql text, p_oczekuj_zero boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_ile integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE WARNING '🔴 LUKA: % — zapis PRZESZEDŁ (% wierszy)', p_opis, v_ile;
  ELSE
    RAISE NOTICE '   ok: % — zero wierszy (RLS odfiltrowało)', p_opis;
  END IF;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  RAISE NOTICE '   ok: % — odmowa (%)', p_opis, SQLERRM;
WHEN others THEN
  RAISE NOTICE '   ok: % — błąd: %', p_opis, left(SQLERRM, 60);
END $$;

-- Klient: właściciel warsztatu TEST GARAGE.
--
-- ⚠️ `SET LOCAL` poza blokiem transakcji NIE DZIAŁA — psql jest w autocommit,
-- więc ustawienie ginie natychmiast i całość leci jako `postgres`, czyli
-- superużytkownik, który OMIJA RLS z definicji. Pierwszy przebieg tego audytu
-- pokazał przez to czternaście „luk", z których żadna nie istniała.
SET ROLE authenticated;
SET "app.uid" = '11111111-1111-1111-1111-111111111111';

\echo '═══ KONTROLA WSTĘPNA — czy w ogóle jesteśmy tą rolą ═══'
SELECT current_user AS rola_biezaca,
       auth.uid()   AS widziany_uzytkownik,
       -- Próba kontrolna: odczyt, który MA się udać. Gdyby i on padał,
       -- wszystkie odmowy niżej znaczyłyby „brak uprawnień do tabeli",
       -- a nie „RLS zadziałało" — i audyt byłby bezwartościowy.
       (SELECT count(*) FROM service_providers) AS widzi_warsztatow;

\echo '═══ PRÓBY ZAPISU JAKO ZALOGOWANY KLIENT ═══'

SELECT public._probuj('billing_addon_packs INSERT (darmowa paczka 9999)',
  $q$ INSERT INTO billing_addon_packs (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining, source)
      SELECT 'service_provider','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 9999, 9999, 'purchase'
      FROM billing_features WHERE key='sms' $q$);

SELECT public._probuj('billing_addon_packs UPDATE (podniesienie salda)',
  $q$ UPDATE billing_addon_packs SET amount_remaining = 99999
      WHERE subscriber_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $q$);

SELECT public._probuj('billing_orders INSERT (zamówienie od razu opłacone)',
  $q$ INSERT INTO billing_orders (subscriber_type, subscriber_id, user_id, product_id, amount_gross, units, status)
      SELECT 'service_provider','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',
             p.id, 0.01, 1000, 'oplacone' FROM billing_addon_products p LIMIT 1 $q$);

SELECT public._probuj('billing_orders UPDATE (przestawienie na oplacone)',
  $q$ UPDATE billing_orders SET status='oplacone', wydane_at=NULL $q$);

SELECT public._probuj('sms_credit_ledger INSERT (dopisanie 5000 SMS)',
  $q$ INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5000, 'zakup', 'test') $q$);

SELECT public._probuj('vehicle_lookup_credits INSERT (własne kredyty)',
  $q$ INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
      VALUES ('11111111-1111-1111-1111-111111111111', 500, 500)
      ON CONFLICT (user_id) DO UPDATE SET remaining_credits = 500 $q$);

SELECT public._probuj('vehicle_lookup_credits UPDATE (podniesienie salda)',
  $q$ UPDATE vehicle_lookup_credits SET remaining_credits = 500
      WHERE user_id='11111111-1111-1111-1111-111111111111' $q$);

SELECT public._probuj('vehicle_lookup_credit_transactions INSERT',
  $q$ INSERT INTO vehicle_lookup_credit_transactions (user_id, type, credits, source, note)
      VALUES ('11111111-1111-1111-1111-111111111111','purchase',500,'payment','test') $q$);

SELECT public._probuj('service_providers.sms_balance UPDATE (własny warsztat)',
  $q$ UPDATE service_providers SET sms_balance = 9999
      WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $q$);

SELECT public._probuj('billing_events INSERT (zatrucie strażnika powtórek)',
  $q$ INSERT INTO billing_events (provider, event_type, external_id, payload, status)
      VALUES ('payu','order.completed','payu:PODROBIONE:COMPLETED','{}'::jsonb,'pending') $q$);

SELECT public._probuj('billing_events DELETE (skasowanie śladu, by wydać drugi raz)',
  $q$ DELETE FROM billing_events $q$);

SELECT public._probuj('billing_plan_features UPDATE (podniesienie limitu VIN)',
  $q$ UPDATE billing_plan_features SET limit_value = 99999 $q$);

SELECT public._probuj('billing_addon_products UPDATE (cena 0,01 zł)',
  $q$ UPDATE billing_addon_products SET unit_price_net = 0.01 $q$);

SELECT public._probuj('billing_subscriptions INSERT (darmowy abonament)',
  $q$ INSERT INTO billing_subscriptions (subscriber_type, subscriber_id, plan_id, status)
      SELECT 'service_provider','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, 'active'
      FROM billing_plans WHERE code='warsztat_sieci' $q$);

RESET ROLE;
DROP FUNCTION public._probuj(text, text, boolean);

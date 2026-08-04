-- ============================================================================
-- HOTFIX BEZPIECZEŃSTWA PŁATNOŚCI
--
-- Zamyka trzy niezależne drogi do darmowych środków, wszystkie wywoływalne
-- z przeglądarki przez zwykłego zalogowanego użytkownika:
--
--  1. `user_credits` miała politykę FOR ALL USING (user_id = auth.uid()).
--     FOR ALL obejmuje UPDATE, więc każdy mógł sobie ustawić dowolne saldo.
--  2. `payments` miała own_payments_insert WITH CHECK (user_id = auth.uid()).
--     Użytkownik wstawiał sobie wiersz płatności, a potem oznaczał go jako
--     opłacony przez niezabezpieczony webhook (patrz zmiany w payment-core).
--  3. `credit_welcome_bonus(p_user_id, p_amount)` to SECURITY DEFINER
--     z GRANT EXECUTE dla `authenticated`, a kwotę bierze z argumentu —
--     jedno wywołanie z dowolną kwotą. Ta sama klasa problemu dotyczy
--     funkcji deduct_*, którymi można było zdejmować cudze kredyty.
--
-- Zasada po zmianie: klient CZYTA salda, nie zapisuje ich. Każdy zapis idzie
-- przez service_role (edge functions), który omija RLS i nie jest objęty
-- odebranymi grantami.
--
-- Zweryfikowane przed napisaniem: żaden plik w src/ nie wykonuje insert/update/
-- delete na tych tabelach ani nie woła tych trzech RPC — lockdown nie urywa
-- istniejącej ścieżki w aplikacji.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- user_credits
DROP POLICY IF EXISTS "own_credits"                        ON public.user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can view their own credits"   ON public.user_credits;

CREATE POLICY "user_credits_select_own" ON public.user_credits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_credits_select_admin" ON public.user_credits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ------------------------------------------------------------- ai_user_credits
-- Miała już wyłącznie polityki SELECT (własne + admin) — zostają bez zmian.
-- Odebranie grantów niżej jest tu drugą warstwą, na wypadek dodania polityki.

-- ------------------------------------------------------ vehicle_lookup_credits
DROP POLICY IF EXISTS "Users can insert own credits"  ON public.vehicle_lookup_credits;
DROP POLICY IF EXISTS "Users can update own credits"  ON public.vehicle_lookup_credits;
DROP POLICY IF EXISTS "Admins manage all credits"     ON public.vehicle_lookup_credits;

CREATE POLICY "vlc_select_admin" ON public.vehicle_lookup_credits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ----------------------------------------- vehicle_lookup_credit_transactions
-- Księga kredytów: klient mógł dopisywać własne wpisy, czyli fałszować historię.
DROP POLICY IF EXISTS "Insert own credit transactions"       ON public.vehicle_lookup_credit_transactions;
DROP POLICY IF EXISTS "Admins manage all credit transactions" ON public.vehicle_lookup_credit_transactions;

CREATE POLICY "vlct_select_admin" ON public.vehicle_lookup_credit_transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- --------------------------------------------------------------- user_wallets
DROP POLICY IF EXISTS "System can create wallets"  ON public.user_wallets;
DROP POLICY IF EXISTS "Admins can manage wallets"  ON public.user_wallets;

CREATE POLICY "user_wallets_select_admin" ON public.user_wallets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- --------------------------------------------------------- wallet_transactions
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.wallet_transactions;

CREATE POLICY "wallet_tx_select_admin" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ----------------------------------------------------- wallet_pln_transactions
-- SELECT (własne lub admin) zostaje; znika ścieżka zapisu z przeglądarki.
DROP POLICY IF EXISTS "Admin manages pln tx" ON public.wallet_pln_transactions;

-- ------------------------------------------------------------------- payments
DROP POLICY IF EXISTS "own_payments_insert" ON public.payments;

CREATE POLICY "payments_select_admin" ON public.payments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================================
-- Druga warstwa: bez grantu PostgREST nie zapisze nawet przy permisywnej
-- polityce. service_role ma własne granty i omija RLS, więc edge functions
-- działają dalej.
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.user_credits                        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_user_credits                     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vehicle_lookup_credits              FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vehicle_lookup_credit_transactions  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_wallets                        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions                 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_pln_transactions             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments                            FROM anon, authenticated;

-- ============================================================================
-- Funkcje SECURITY DEFINER operujące na saldach. Wszystkie trzy są wołane
-- wyłącznie z edge functions na service_role (register-marketplace-user,
-- workshop-send-sms, send-sms, vehicle-check) — żaden komponent front-endu ich
-- nie woła, więc odebranie grantu `authenticated` niczego nie psuje.
--
--   credit_welcome_bonus  — przyznawała dowolną kwotę z argumentu (kran)
--   deduct_*              — pozwalały zdjąć kredyty CUDZEMU userowi/warsztatowi
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.credit_welcome_bonus(uuid, numeric)  FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_sms_credit(uuid)              FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_vehicle_lookup_credit(uuid)   FROM authenticated, anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.credit_welcome_bonus(uuid, numeric)   TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_sms_credit(uuid)               TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_vehicle_lookup_credit(uuid)    TO service_role;

-- ============================================================================
-- service_providers.sms_balance — saldo SMS-ów.
--
-- Tej kolumny nie da się domknąć tak jak pozostałych sald: siedzi w tabeli
-- z 43 kolumnami, którą usługodawca legalnie edytuje (nazwa, adres, godziny,
-- zdjęcia) polityką "Users can update own provider". Odebranie UPDATE zabiłoby
-- edycję profilu, a granty kolumnowe wymagałyby wypisania 42 pozostałych kolumn
-- i pilnowania każdej nowej.
--
-- Zamiast tego trigger pilnuje jednej kolumny: profil edytuje się bez zmian,
-- service_role (edge functions) przechodzi, a klient dostaje twardy błąd przy
-- próbie ruszenia salda. Docelowo saldo wyjdzie do osobnej tabeli — przy
-- uruchamianiu billingu, bo dotyka 27 miejsc w kodzie.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_sms_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sms_balance IS DISTINCT FROM OLD.sms_balance
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'sms_balance nie może być zmieniane z klienta — użyj payment-core';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_sms_balance() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_sms_balance ON public.service_providers;
CREATE TRIGGER trg_guard_sms_balance
  BEFORE UPDATE ON public.service_providers
  FOR EACH ROW EXECUTE FUNCTION public.guard_sms_balance();

COMMIT;

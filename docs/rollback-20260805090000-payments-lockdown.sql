-- ============================================================================
-- COFNIĘCIE migracji 20260805090000_payments_lockdown.sql
--
-- ⚠️ UWAGA: to przywraca stan sprzed lockdownu, czyli PONOWNIE OTWIERA cztery
-- drogi do darmowych środków:
--   * dowolny zalogowany użytkownik może zmienić własne saldo w user_credits
--   * może wstawić sobie wiersz w payments (i przy niezabezpieczonym webhooku
--     oznaczyć go jako opłacony)
--   * może wywołać credit_welcome_bonus z dowolną kwotą
--   * może zdejmować kredyty innym przez deduct_*
--
-- Używaj wyłącznie, gdy lockdown zepsuł działającą funkcję i trzeba przywrócić
-- ruch. Docelowo naprawiaj przyczynę, nie cofaj tej migracji na stałe.
--
-- Zakłada, że migracja wykonała się w całości. Jeśli przerwała się w środku,
-- transakcja i tak wycofała wszystko — wtedy ten plik jest niepotrzebny.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- user_credits
DROP POLICY IF EXISTS "user_credits_select_own"   ON public.user_credits;
DROP POLICY IF EXISTS "user_credits_select_admin" ON public.user_credits;

CREATE POLICY "Users can view their own credits"
  ON public.user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own credits"
  ON public.user_credits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_credits"
  ON public.user_credits FOR ALL USING (user_id = auth.uid());

-- ------------------------------------------------------ vehicle_lookup_credits
DROP POLICY IF EXISTS "vlc_select_admin" ON public.vehicle_lookup_credits;

CREATE POLICY "Users can insert own credits" ON public.vehicle_lookup_credits
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own credits" ON public.vehicle_lookup_credits
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage all credits" ON public.vehicle_lookup_credits
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------- vehicle_lookup_credit_transactions
DROP POLICY IF EXISTS "vlct_select_admin" ON public.vehicle_lookup_credit_transactions;

CREATE POLICY "Insert own credit transactions" ON public.vehicle_lookup_credit_transactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage all credit transactions" ON public.vehicle_lookup_credit_transactions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- --------------------------------------------------------------- user_wallets
DROP POLICY IF EXISTS "user_wallets_select_admin" ON public.user_wallets;

CREATE POLICY "System can create wallets" ON public.user_wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage wallets" ON public.user_wallets
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- --------------------------------------------------------- wallet_transactions
DROP POLICY IF EXISTS "wallet_tx_select_admin" ON public.wallet_transactions;

CREATE POLICY "Admins can manage transactions" ON public.wallet_transactions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------- wallet_pln_transactions
CREATE POLICY "Admin manages pln tx" ON public.wallet_pln_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ------------------------------------------------------------------- payments
DROP POLICY IF EXISTS "payments_select_admin" ON public.payments;

CREATE POLICY "own_payments_insert" ON public.payments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------------- granty
GRANT INSERT, UPDATE, DELETE ON public.user_credits                        TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_user_credits                     TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_lookup_credits              TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_lookup_credit_transactions  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_wallets                        TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.wallet_transactions                 TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.wallet_pln_transactions             TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payments                            TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credit_welcome_bonus(uuid, numeric)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_sms_credit(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_vehicle_lookup_credit(uuid)   TO authenticated;

-- ------------------------------------------------------ sms_balance (wariant C)
DROP TRIGGER IF EXISTS trg_guard_sms_balance ON public.service_providers;
DROP FUNCTION IF EXISTS public.guard_sms_balance();

COMMIT;

-- ============================================================================
-- Cofnięcie drugiej migracji (20260805120000_balances_server_side) — osobno,
-- bo jest niezależna i zwykle NIE trzeba jej cofać: dodaje wyłącznie trigger
-- zakładający puste salda i księgę bonusów. Cofaj tylko, jeśli trigger
-- rzeczywiście przeszkadza.
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS on_auth_user_created_provision_balances ON auth.users;
--   DROP FUNCTION IF EXISTS public.provision_user_balances();
--   -- Tabeli credit_welcome_claims NIE kasuj bez potrzeby: trzyma informację,
--   -- kto już dostał bonus. Jej usunięcie pozwoli przyznać bonus po raz drugi.
--   -- DROP TABLE IF EXISTS public.credit_welcome_claims;
-- COMMIT;
-- ============================================================================

-- Program poleceń WYŁĄCZONY do odwołania.
--
-- Decyzja: nie uruchamiamy go na start. Nic nie kasujemy — tabele, kody
-- i historia zostają, a włączenie ma być JEDNĄ zmianą w bazie, bez deployu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO ISTNIEJĄCY PRZEŁĄCZNIK, A NIE NOWY
-- ═══════════════════════════════════════════════════════════════════════════
-- `referral_settings.is_enabled` już istnieje i `link_referral_on_signup` go
-- przestrzega. Dokładanie drugiej flagi w `billing_settings` dałoby dwa źródła
-- prawdy i pytanie „które wygrywa". Zamiast tego dopinamy do TEJ SAMEJ flagi
-- dwie funkcje, które jej dotąd nie sprawdzały.
--
-- WŁĄCZENIE PROGRAMU:  UPDATE referral_settings SET is_enabled = true;
-- Nic więcej. Interfejs czyta tę samą flagę.

BEGIN;

-- Tabela bywa pusta — bez wiersza `SELECT ... LIMIT 1` zwraca NULL i funkcje
-- schodzą do gałęzi „wyłączone", ale wtedy nie ma czego przestawić przy
-- włączaniu. Zakładamy wiersz jawnie.
INSERT INTO public.referral_settings (is_enabled)
SELECT false
WHERE NOT EXISTS (SELECT 1 FROM public.referral_settings);

UPDATE public.referral_settings SET is_enabled = false, updated_at = now();

-- ---------------------------------------------------------------------------
-- 1. Nagroda za pierwszy zakup — sprawdza flagę
-- ---------------------------------------------------------------------------
-- Ta funkcja NIE sprawdzała `is_enabled`. Wypłacała do `user_wallets.pln_balance`
-- po 150 zł polecającemu i poleconemu (dwa konta firmowe), wołana przez
-- `payment-core` po każdej udanej płatności. Wyłączenie programu przy
-- rejestracji nic nie dawało, dopóki ta wypłata działała niezależnie.
-- DROP przed CREATE. Na produkcji typ zwracany się nie zmienia, więc samo
-- `CREATE OR REPLACE` by wystarczyło — ale migracja 2 padła dokładnie na tym
-- błędzie i wolę, żeby ta przeszła niezależnie od tego, co zastanie.
DROP FUNCTION IF EXISTS public.complete_referral_on_first_purchase(uuid, numeric, uuid);

CREATE FUNCTION public.complete_referral_on_first_purchase(
  p_referred_user_id uuid,
  p_order_amount_pln numeric,
  p_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ref record;
  v_referrer_type text;
  v_referred_type text;
  v_amount numeric(10,2) := 0;
  v_reward_type text := 'balance';
  v_expires timestamptz := now() + interval '6 months';
  v_wlaczony boolean;
BEGIN
  -- ── PRZEŁĄCZNIK PROGRAMU ──────────────────────────────────────────
  -- Fail-closed: brak wiersza ustawień znaczy „wyłączone", a nie „wypłacaj".
  SELECT COALESCE(is_enabled, false) INTO v_wlaczony FROM referral_settings LIMIT 1;
  IF COALESCE(v_wlaczony, false) = false THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'program_wylaczony');
  END IF;

  IF COALESCE(p_order_amount_pln, 0) < 30 THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'order_below_min_30');
  END IF;

  SELECT * INTO v_ref FROM referral_uses
   WHERE referred_user_id = p_referred_user_id
     AND status = 'pending_first_purchase'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('completed', false, 'reason', 'no_pending_referral');
  END IF;

  v_referrer_type := public.get_user_account_type(v_ref.referrer_user_id);
  v_referred_type := public.get_user_account_type(p_referred_user_id);

  IF v_referrer_type = 'workshop' AND v_referred_type = 'workshop' THEN
    v_reward_type := 'free_month';
    v_amount := 0;
  ELSIF v_referrer_type = 'business' AND v_referred_type = 'business' THEN
    v_amount := 150;
  ELSIF v_referrer_type IN ('business','workshop') OR v_referred_type IN ('business','workshop') THEN
    v_amount := 100;
  ELSE
    v_amount := 50;
  END IF;

  UPDATE referral_uses SET
    status = 'completed',
    first_purchase_at = now(),
    completed_at = now(),
    reward_amount_pln = v_amount,
    reward_type = v_reward_type,
    coins_awarded = 0
  WHERE id = v_ref.id;

  UPDATE referral_codes
    SET uses_count = COALESCE(uses_count,0) + 1,
        total_earnings = COALESCE(total_earnings,0) + v_amount::int
  WHERE id = v_ref.referral_code_id;

  IF v_reward_type = 'balance' AND v_amount > 0 THEN
    INSERT INTO user_wallets (user_id, pln_balance, pln_total_earned, balance, coins_balance, total_earned)
      VALUES (v_ref.referrer_user_id, v_amount, v_amount, 0, 0, 0)
      ON CONFLICT (user_id) DO UPDATE SET
        pln_balance = user_wallets.pln_balance + v_amount,
        pln_total_earned = user_wallets.pln_total_earned + v_amount,
        updated_at = now();

    INSERT INTO wallet_pln_transactions (user_id, type, amount, description, related_user_id, related_order_id, expires_at)
      VALUES (v_ref.referrer_user_id, 'referral_reward', v_amount,
              'Nagroda za polecenie nowego użytkownika', p_referred_user_id, p_order_id, v_expires);

    INSERT INTO user_wallets (user_id, pln_balance, pln_total_earned, balance, coins_balance, total_earned)
      VALUES (p_referred_user_id, v_amount, v_amount, 0, 0, 0)
      ON CONFLICT (user_id) DO UPDATE SET
        pln_balance = user_wallets.pln_balance + v_amount,
        pln_total_earned = user_wallets.pln_total_earned + v_amount,
        updated_at = now();

    INSERT INTO wallet_pln_transactions (user_id, type, amount, description, related_user_id, related_order_id, expires_at)
      VALUES (p_referred_user_id, 'referred_reward', v_amount,
              'Bonus za przyjście z polecenia', v_ref.referrer_user_id, p_order_id, v_expires);
  END IF;

  RETURN jsonb_build_object('completed', true, 'reward_type', v_reward_type, 'amount', v_amount);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Bonus powitalny — ta sama flaga
-- ---------------------------------------------------------------------------
-- 20 zł przy rejestracji. Osobna funkcja od poleceń, ale ta sama kieszeń
-- (`pln_balance`) i ta sama decyzja: nie rozdajemy tego na start.
DROP FUNCTION IF EXISTS public.credit_welcome_bonus(uuid, numeric);

CREATE FUNCTION public.credit_welcome_bonus(p_user_id uuid, p_amount numeric DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expires timestamptz := now() + interval '6 months';
  v_wlaczony boolean;
BEGIN
  SELECT COALESCE(is_enabled, false) INTO v_wlaczony FROM referral_settings LIMIT 1;
  IF COALESCE(v_wlaczony, false) = false THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'program_wylaczony');
  END IF;

  IF EXISTS (
    SELECT 1 FROM wallet_pln_transactions
     WHERE user_id = p_user_id AND type = 'welcome_bonus'
  ) THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'already_received');
  END IF;

  INSERT INTO user_wallets (user_id, pln_balance, pln_total_earned, balance, coins_balance, total_earned)
    VALUES (p_user_id, p_amount, p_amount, 0, 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      pln_balance = user_wallets.pln_balance + p_amount,
      pln_total_earned = user_wallets.pln_total_earned + p_amount,
      updated_at = now();

  INSERT INTO wallet_pln_transactions (user_id, type, amount, description, expires_at)
    VALUES (p_user_id, 'welcome_bonus', p_amount, 'Bonus powitalny', v_expires);

  RETURN jsonb_build_object('credited', true, 'amount', p_amount);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Odczyt flagi dla interfejsu
-- ---------------------------------------------------------------------------
-- Front musi wiedzieć, czy pokazywać kody polecające. Bez tego włączenie
-- programu wymagałoby deployu, a ma być jedną zmianą w bazie.
CREATE OR REPLACE FUNCTION public.program_polecen_wlaczony()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT is_enabled FROM referral_settings LIMIT 1), false) $$;

REVOKE ALL ON FUNCTION public.program_polecen_wlaczony() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.program_polecen_wlaczony() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_stan boolean;
BEGIN
  SELECT public.program_polecen_wlaczony() INTO v_stan;
  IF v_stan THEN
    RAISE EXCEPTION 'Program poleceń nadal włączony — migracja nie osiągnęła celu';
  END IF;
  RAISE NOTICE 'Program poleceń wyłączony. Włączenie: UPDATE referral_settings SET is_enabled = true;';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- 1. Extend referral_uses
ALTER TABLE public.referral_uses
  ADD COLUMN IF NOT EXISTS first_purchase_at timestamptz,
  ADD COLUMN IF NOT EXISTS reward_amount_pln numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_type text NOT NULL DEFAULT 'balance',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_reason text;

-- 2. Extend user_wallets with PLN balance
ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS pln_balance numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pln_total_earned numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pln_total_spent numeric(10,2) NOT NULL DEFAULT 0;

-- 3. wallet_pln_transactions
CREATE TABLE IF NOT EXISTS public.wallet_pln_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  description text,
  related_user_id uuid,
  related_order_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_pln_tx_user ON public.wallet_pln_transactions(user_id, created_at DESC);

GRANT SELECT ON public.wallet_pln_transactions TO authenticated;
GRANT ALL ON public.wallet_pln_transactions TO service_role;

ALTER TABLE public.wallet_pln_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pln tx"
  ON public.wallet_pln_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin manages pln tx"
  ON public.wallet_pln_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. get_user_account_type
CREATE OR REPLACE FUNCTION public.get_user_account_type(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_type text;
  v_account_mode text;
  v_company_nip text;
BEGIN
  -- Workshop = service_providers exists
  IF EXISTS (SELECT 1 FROM service_providers WHERE user_id = p_user_id) THEN
    RETURN 'workshop';
  END IF;
  -- Business = marketplace profile with account_mode='business' or NIP set
  SELECT account_mode, company_nip INTO v_account_mode, v_company_nip
  FROM marketplace_user_profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_account_mode = 'business' OR (v_company_nip IS NOT NULL AND length(v_company_nip) > 0) THEN
    RETURN 'business';
  END IF;
  RETURN 'private';
END;
$$;

-- 5. ensure_referral_code
CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempts int := 0;
BEGIN
  SELECT code INTO v_code FROM referral_codes WHERE user_id = p_user_id LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      v_code := v_code || floor(random() * 99)::text;
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO referral_codes (user_id, code, is_active)
  VALUES (p_user_id, v_code, true)
  ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code
  RETURNING code INTO v_code;
  RETURN v_code;
EXCEPTION WHEN unique_violation THEN
  SELECT code INTO v_code FROM referral_codes WHERE user_id = p_user_id LIMIT 1;
  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO authenticated, service_role;

-- Ensure user_id unique on referral_codes (one code per user)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_codes_user_id_key') THEN
    BEGIN
      ALTER TABLE public.referral_codes ADD CONSTRAINT referral_codes_user_id_key UNIQUE (user_id);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN NULL;
    END;
  END IF;
END $$;

-- 6. link_referral_on_signup
CREATE OR REPLACE FUNCTION public.link_referral_on_signup(
  p_referred_user_id uuid,
  p_code text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code_row record;
  v_settings record;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'no_code');
  END IF;

  SELECT * INTO v_settings FROM referral_settings LIMIT 1;
  IF v_settings.is_enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'disabled');
  END IF;

  SELECT * INTO v_code_row FROM referral_codes
   WHERE code = upper(trim(p_code)) AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'invalid_code');
  END IF;

  IF v_code_row.user_id = p_referred_user_id THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'self_referral');
  END IF;

  IF EXISTS (SELECT 1 FROM referral_uses WHERE referred_user_id = p_referred_user_id) THEN
    RETURN jsonb_build_object('linked', false, 'reason', 'already_referred');
  END IF;

  INSERT INTO referral_uses (
    referral_code_id, referred_user_id, referrer_user_id,
    ip_address, user_agent, status, coins_awarded
  ) VALUES (
    v_code_row.id, p_referred_user_id, v_code_row.user_id,
    p_ip, p_user_agent, 'pending_first_purchase', 0
  );

  RETURN jsonb_build_object(
    'linked', true,
    'referrer_user_id', v_code_row.user_id,
    'code', v_code_row.code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_referral_on_signup(uuid, text, text, text) TO authenticated, service_role, anon;

-- 7. complete_referral_on_first_purchase
CREATE OR REPLACE FUNCTION public.complete_referral_on_first_purchase(
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
BEGIN
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

  -- Reward calculation per spec
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

  -- Update referral row
  UPDATE referral_uses SET
    status = 'completed',
    first_purchase_at = now(),
    completed_at = now(),
    reward_amount_pln = v_amount,
    reward_type = v_reward_type,
    coins_awarded = 0
  WHERE id = v_ref.id;

  -- Update aggregate stats
  UPDATE referral_codes
    SET uses_count = COALESCE(uses_count,0) + 1,
        total_earnings = COALESCE(total_earnings,0) + v_amount::int
  WHERE id = v_ref.referral_code_id;

  IF v_reward_type = 'balance' AND v_amount > 0 THEN
    -- Credit referrer
    INSERT INTO user_wallets (user_id, pln_balance, pln_total_earned, balance, coins_balance, total_earned)
      VALUES (v_ref.referrer_user_id, v_amount, v_amount, 0, 0, 0)
      ON CONFLICT (user_id) DO UPDATE SET
        pln_balance = user_wallets.pln_balance + v_amount,
        pln_total_earned = user_wallets.pln_total_earned + v_amount,
        updated_at = now();

    INSERT INTO wallet_pln_transactions (user_id, type, amount, description, related_user_id, related_order_id, expires_at)
      VALUES (v_ref.referrer_user_id, 'referral_reward', v_amount,
              'Nagroda za polecenie nowego użytkownika', p_referred_user_id, p_order_id, v_expires);

    -- Credit referred
    INSERT INTO user_wallets (user_id, pln_balance, pln_total_earned, balance, coins_balance, total_earned)
      VALUES (p_referred_user_id, v_amount, v_amount, 0, 0, 0)
      ON CONFLICT (user_id) DO UPDATE SET
        pln_balance = user_wallets.pln_balance + v_amount,
        pln_total_earned = user_wallets.pln_total_earned + v_amount,
        updated_at = now();

    INSERT INTO wallet_pln_transactions (user_id, type, amount, description, related_user_id, related_order_id, expires_at)
      VALUES (p_referred_user_id, 'referred_reward', v_amount,
              'Bonus za przyjście z polecenia', v_ref.referrer_user_id, p_order_id, v_expires);
  ELSIF v_reward_type = 'free_month' THEN
    -- Log marker transactions (no PLN credit). Subscription credit table handled later.
    INSERT INTO wallet_pln_transactions (user_id, type, amount, description, related_user_id, related_order_id, expires_at)
      VALUES
        (v_ref.referrer_user_id, 'referral_reward_free_month', 0,
         '1 miesiąc systemu GRATIS za polecenie warsztatu', p_referred_user_id, p_order_id, v_expires),
        (p_referred_user_id, 'referred_reward_free_month', 0,
         '1 miesiąc systemu GRATIS jako nowy warsztat z polecenia', v_ref.referrer_user_id, p_order_id, v_expires);
  END IF;

  RETURN jsonb_build_object(
    'completed', true,
    'reward_type', v_reward_type,
    'amount_pln', v_amount,
    'referrer_user_id', v_ref.referrer_user_id,
    'referrer_type', v_referrer_type,
    'referred_type', v_referred_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_referral_on_first_purchase(uuid, numeric, uuid) TO service_role;

-- 8. credit_welcome_bonus (idempotent per user)
CREATE OR REPLACE FUNCTION public.credit_welcome_bonus(p_user_id uuid, p_amount numeric DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expires timestamptz := now() + interval '6 months';
BEGIN
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
    VALUES (p_user_id, 'welcome_bonus', p_amount,
            'Bonus powitalny ' || p_amount || ' zł', v_expires);

  RETURN jsonb_build_object('credited', true, 'amount', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_welcome_bonus(uuid, numeric) TO authenticated, service_role;

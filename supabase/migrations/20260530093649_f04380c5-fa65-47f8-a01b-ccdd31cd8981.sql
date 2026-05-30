
-- Test migration: verifies referral reward calculations across 3 scenarios.
-- Creates ephemeral test users, runs scenarios, asserts, then cleans up.
-- No schema changes; rolls back on assertion failure.

DO $$
DECLARE
  v_ref_priv uuid := gen_random_uuid();
  v_new_priv uuid := gen_random_uuid();
  v_ref_biz  uuid := gen_random_uuid();
  v_new_biz  uuid := gen_random_uuid();
  v_ref_mix  uuid := gen_random_uuid();
  v_new_mix  uuid := gen_random_uuid();
  v_code1 text; v_code2 text; v_code3 text;
  v_link jsonb; v_result jsonb;
BEGIN
  -- Ensure referral system enabled
  UPDATE public.referral_settings SET is_enabled = true;
  IF NOT FOUND THEN
    INSERT INTO public.referral_settings (is_enabled) VALUES (true);
  END IF;

  -- Create ephemeral auth.users
  INSERT INTO auth.users (id, email) VALUES
    (v_ref_priv, 'test_ref_priv_'||v_ref_priv||'@test.local'),
    (v_new_priv, 'test_new_priv_'||v_new_priv||'@test.local'),
    (v_ref_biz,  'test_ref_biz_'||v_ref_biz||'@test.local'),
    (v_new_biz,  'test_new_biz_'||v_new_biz||'@test.local'),
    (v_ref_mix,  'test_ref_mix_'||v_ref_mix||'@test.local'),
    (v_new_mix,  'test_new_mix_'||v_new_mix||'@test.local');

  -- Profiles: private accounts (account_mode='buyer', no NIP)
  INSERT INTO public.marketplace_user_profiles (user_id, first_name, email, account_mode)
  VALUES
    (v_ref_priv, 'RefPriv', 'rp@test.local', 'buyer'),
    (v_new_priv, 'NewPriv', 'np@test.local', 'buyer'),
    (v_new_mix,  'NewMix',  'nm@test.local', 'buyer');

  -- Business accounts (account_mode='business' with NIP)
  INSERT INTO public.marketplace_user_profiles (user_id, first_name, email, account_mode, company_nip)
  VALUES
    (v_ref_biz, 'RefBiz', 'rb@test.local', 'business', '1234567890'),
    (v_new_biz, 'NewBiz', 'nb@test.local', 'business', '0987654321'),
    (v_ref_mix, 'RefMix', 'rm@test.local', 'business', '1111111111');

  -- Generate referral codes for referrers
  v_code1 := public.ensure_referral_code(v_ref_priv);
  v_code2 := public.ensure_referral_code(v_ref_biz);
  v_code3 := public.ensure_referral_code(v_ref_mix);

  RAISE NOTICE '── Codes: priv=% biz=% mix=%', v_code1, v_code2, v_code3;

  -- TEST 1: Private referrer → Private referred → expect 50 PLN
  v_link := public.link_referral_on_signup(v_new_priv, v_code1, NULL, NULL);
  IF (v_link->>'linked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST1 link failed: %', v_link;
  END IF;
  v_result := public.complete_referral_on_first_purchase(v_new_priv, 100, NULL);
  RAISE NOTICE 'TEST1 (priv→priv) result: %', v_result;
  IF (v_result->>'completed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST1 not completed: %', v_result;
  END IF;
  IF (v_result->>'amount_pln')::numeric <> 50 THEN
    RAISE EXCEPTION 'TEST1 FAIL: expected 50 PLN, got %', v_result->>'amount_pln';
  END IF;
  -- Verify wallet credit
  IF (SELECT pln_balance FROM public.user_wallets WHERE user_id = v_ref_priv) <> 50 THEN
    RAISE EXCEPTION 'TEST1 FAIL: referrer wallet not credited 50';
  END IF;
  IF (SELECT pln_balance FROM public.user_wallets WHERE user_id = v_new_priv) <> 50 THEN
    RAISE EXCEPTION 'TEST1 FAIL: referred wallet not credited 50';
  END IF;
  RAISE NOTICE '✅ TEST1 PASS: Private→Private = 50 PLN';

  -- TEST 2: Business referrer → Business referred → expect 150 PLN
  v_link := public.link_referral_on_signup(v_new_biz, v_code2, NULL, NULL);
  IF (v_link->>'linked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST2 link failed: %', v_link;
  END IF;
  v_result := public.complete_referral_on_first_purchase(v_new_biz, 500, NULL);
  RAISE NOTICE 'TEST2 (biz→biz) result: %', v_result;
  IF (v_result->>'amount_pln')::numeric <> 150 THEN
    RAISE EXCEPTION 'TEST2 FAIL: expected 150 PLN, got %', v_result->>'amount_pln';
  END IF;
  IF (SELECT pln_balance FROM public.user_wallets WHERE user_id = v_ref_biz) <> 150 THEN
    RAISE EXCEPTION 'TEST2 FAIL: referrer wallet not credited 150';
  END IF;
  RAISE NOTICE '✅ TEST2 PASS: Business→Business = 150 PLN';

  -- TEST 3: Business referrer → Private referred → expect 100 PLN (mixed)
  v_link := public.link_referral_on_signup(v_new_mix, v_code3, NULL, NULL);
  IF (v_link->>'linked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST3 link failed: %', v_link;
  END IF;
  v_result := public.complete_referral_on_first_purchase(v_new_mix, 50, NULL);
  RAISE NOTICE 'TEST3 (biz→priv mixed) result: %', v_result;
  IF (v_result->>'amount_pln')::numeric <> 100 THEN
    RAISE EXCEPTION 'TEST3 FAIL: expected 100 PLN, got %', v_result->>'amount_pln';
  END IF;
  IF (SELECT pln_balance FROM public.user_wallets WHERE user_id = v_ref_mix) <> 100 THEN
    RAISE EXCEPTION 'TEST3 FAIL: referrer wallet not credited 100';
  END IF;
  RAISE NOTICE '✅ TEST3 PASS: Business↔Private mixed = 100 PLN';

  -- BONUS TEST: order below 30 PLN should NOT complete
  -- (Use a fresh user/code so we can test the guard)
  DECLARE
    v_low uuid := gen_random_uuid();
    v_low_code text;
    v_low_link jsonb;
    v_low_res jsonb;
  BEGIN
    INSERT INTO auth.users (id, email) VALUES (v_low, 'test_low_'||v_low||'@test.local');
    INSERT INTO public.marketplace_user_profiles (user_id, first_name, email, account_mode)
      VALUES (v_low, 'LowOrder', 'lo@test.local', 'buyer');
    v_low_code := public.ensure_referral_code(v_ref_priv); -- reuse existing code
    v_low_link := public.link_referral_on_signup(v_low, v_low_code, NULL, NULL);
    v_low_res := public.complete_referral_on_first_purchase(v_low, 20, NULL);
    IF (v_low_res->>'completed')::boolean IS TRUE THEN
      RAISE EXCEPTION 'GUARD FAIL: order <30 PLN should not complete: %', v_low_res;
    END IF;
    RAISE NOTICE '✅ GUARD PASS: order <30 PLN correctly rejected (%)', v_low_res->>'reason';
    -- Cleanup low user
    DELETE FROM auth.users WHERE id = v_low;
  END;

  -- CLEANUP: cascade deletes wallets, referral_codes, referral_uses, transactions, profiles
  DELETE FROM public.wallet_pln_transactions
    WHERE user_id IN (v_ref_priv,v_new_priv,v_ref_biz,v_new_biz,v_ref_mix,v_new_mix)
       OR related_user_id IN (v_ref_priv,v_new_priv,v_ref_biz,v_new_biz,v_ref_mix,v_new_mix);
  DELETE FROM public.user_wallets WHERE user_id IN (v_ref_priv,v_new_priv,v_ref_biz,v_new_biz,v_ref_mix,v_new_mix);
  DELETE FROM public.marketplace_user_profiles WHERE user_id IN (v_ref_priv,v_new_priv,v_ref_biz,v_new_biz,v_ref_mix,v_new_mix);
  DELETE FROM auth.users WHERE id IN (v_ref_priv,v_new_priv,v_ref_biz,v_new_biz,v_ref_mix,v_new_mix);

  RAISE NOTICE '🎉 ALL REFERRAL REWARD TESTS PASSED — system gotowy do etapu 2';
END $$;

-- Run only against a disposable local Supabase database after all migrations:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security/phase_f_import_idempotency.sql
-- The transaction always rolls back. Never point this fixture at production.

BEGIN;

-- Fixed synthetic identities make actor-binding assertions deterministic.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, email) VALUES
  ('61000000-0000-4000-8000-00000000000a', 'phase-f-import-admin-a@example.test'),
  ('61000000-0000-4000-8000-00000000000b', 'phase-f-import-admin-b@example.test'),
  ('61000000-0000-4000-8000-00000000000c', 'phase-f-import-user-c@example.test');
INSERT INTO public.cities (id, name)
VALUES ('62000000-0000-4000-8000-000000000001', 'Phase F Import Fixture City');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('61000000-0000-4000-8000-00000000000a', 'admin'),
  ('61000000-0000-4000-8000-00000000000b', 'admin');
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $phase_f_import_claims$
DECLARE
  v_claim jsonb;
  v_execution_id uuid;
  v_finalized boolean;
BEGIN
  v_claim := public.phase_f_claim_import_execution(
    'drivers_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64), 300,
    '63000000-0000-4000-8000-000000000001'
  );
  IF v_claim ->> 'decision' <> 'claimed' THEN
    RAISE EXCEPTION 'first_import_claim_failed: %', v_claim;
  END IF;
  v_execution_id := (v_claim ->> 'execution_id')::uuid;

  v_claim := public.phase_f_claim_import_execution(
    'drivers_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64), 300,
    '63000000-0000-4000-8000-000000000002'
  );
  IF v_claim ->> 'decision' <> 'in_progress' THEN
    RAISE EXCEPTION 'parallel_import_was_not_blocked: %', v_claim;
  END IF;

  v_claim := public.phase_f_claim_import_execution(
    'drivers_csv',
    '61000000-0000-4000-8000-00000000000b',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64), 300,
    '63000000-0000-4000-8000-000000000003'
  );
  IF v_claim ->> 'decision' <> 'actor_mismatch' THEN
    RAISE EXCEPTION 'foreign_actor_reused_import_claim: %', v_claim;
  END IF;

  v_claim := public.phase_f_claim_import_execution(
    'drivers_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('c', 64), 300,
    '63000000-0000-4000-8000-000000000004'
  );
  IF v_claim ->> 'decision' <> 'payload_mismatch' THEN
    RAISE EXCEPTION 'changed_payload_reused_import_key: %', v_claim;
  END IF;

  v_finalized := public.phase_f_finalize_import_execution(
    v_execution_id, 'drivers_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64),
    '63000000-0000-4000-8000-000000000099',
    true, '{"imported":1,"updated":0,"errors":0,"total":1}'::jsonb, NULL
  );
  IF v_finalized THEN
    RAISE EXCEPTION 'wrong_lease_owner_finalized_import';
  END IF;

  v_finalized := public.phase_f_finalize_import_execution(
    v_execution_id, 'drivers_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64),
    '63000000-0000-4000-8000-000000000001',
    true, '{"imported":1,"updated":0,"errors":0,"total":1}'::jsonb, NULL
  );
  IF NOT v_finalized THEN
    RAISE EXCEPTION 'valid_import_finalize_failed';
  END IF;

  v_claim := public.phase_f_claim_import_execution(
    'drivers_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('a', 64), repeat('b', 64), 300,
    '63000000-0000-4000-8000-000000000005'
  );
  IF v_claim ->> 'decision' <> 'succeeded'
     OR v_claim #>> '{result_summary,imported}' <> '1' THEN
    RAISE EXCEPTION 'completed_import_replay_failed: %', v_claim;
  END IF;

  BEGIN
    PERFORM public.phase_f_finalize_import_execution(
      v_execution_id, 'drivers_csv',
      '61000000-0000-4000-8000-00000000000a',
      '62000000-0000-4000-8000-000000000001',
      repeat('a', 64), repeat('b', 64),
      '63000000-0000-4000-8000-000000000001',
      true, '{"email":"sensitive@example.test"}'::jsonb, NULL
    );
    RAISE EXCEPTION 'unsafe_result_summary_was_accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.phase_f_claim_import_execution(
      'drivers_csv',
      '61000000-0000-4000-8000-00000000000c',
      '62000000-0000-4000-8000-000000000001',
      repeat('d', 64), repeat('e', 64), 300,
      '63000000-0000-4000-8000-000000000006'
    );
    RAISE EXCEPTION 'ordinary_user_claimed_admin_import';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_claim := public.phase_f_claim_import_execution(
    'settlements_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('f', 64), repeat('1', 64), 300,
    '63000000-0000-4000-8000-000000000007'
  );
  v_execution_id := (v_claim ->> 'execution_id')::uuid;
  v_finalized := public.phase_f_finalize_import_execution(
    v_execution_id, 'settlements_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('f', 64), repeat('1', 64),
    '63000000-0000-4000-8000-000000000007',
    false, NULL, 'provider_timeout'
  );
  IF NOT v_finalized THEN
    RAISE EXCEPTION 'failed_import_finalize_failed';
  END IF;
  v_claim := public.phase_f_claim_import_execution(
    'settlements_csv',
    '61000000-0000-4000-8000-00000000000a',
    '62000000-0000-4000-8000-000000000001',
    repeat('f', 64), repeat('1', 64), 300,
    '63000000-0000-4000-8000-000000000008'
  );
  IF v_claim ->> 'decision' <> 'claimed' OR (v_claim ->> 'attempt')::integer <> 2 THEN
    RAISE EXCEPTION 'failed_import_retry_was_not_claimed: %', v_claim;
  END IF;
END;
$phase_f_import_claims$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claim.sub', '61000000-0000-4000-8000-00000000000a', true
);

DO $phase_f_import_public_denials$
BEGIN
  BEGIN
    PERFORM id FROM public.security_import_execution_jobs LIMIT 1;
    RAISE EXCEPTION 'authenticated_user_read_private_import_jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.phase_f_claim_import_execution(
      'drivers_csv',
      '61000000-0000-4000-8000-00000000000a',
      '62000000-0000-4000-8000-000000000001',
      repeat('9', 64), repeat('8', 64), 300,
      '63000000-0000-4000-8000-000000000009'
    );
    RAISE EXCEPTION 'authenticated_user_called_service_import_claim';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$phase_f_import_public_denials$;

RESET ROLE;
ROLLBACK;

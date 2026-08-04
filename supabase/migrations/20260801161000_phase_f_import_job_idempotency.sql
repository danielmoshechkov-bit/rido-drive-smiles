-- Phase F: durable, actor-bound idempotency for privileged CSV imports.
--
-- The legacy fleet import domain is partitioned by city rather than by a
-- canonical company/tenant identifier. Keep that boundary explicit instead
-- of pretending that a client-supplied company_id is authoritative.

CREATE TABLE IF NOT EXISTS public.security_import_execution_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL CHECK (operation IN ('settlements_csv', 'drivers_csv')),
  -- Immutable actor snapshot: deleting an Auth account must not erase the
  -- idempotency boundary and permit the same job to execute again.
  actor_id uuid NOT NULL,
  tenant_scope_type text NOT NULL DEFAULT 'city' CHECK (tenant_scope_type = 'city'),
  tenant_scope_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 5),
  correlation_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  result_summary jsonb,
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_:-]{1,80}$'
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT security_import_execution_key_unique
    UNIQUE (operation, tenant_scope_id, idempotency_key_hash),
  CONSTRAINT security_import_execution_result_shape CHECK (
    result_summary IS NULL OR (
      jsonb_typeof(result_summary) = 'object'
      AND octet_length(result_summary::text) <= 2048
    )
  )
);

CREATE INDEX IF NOT EXISTS security_import_execution_status_lease_idx
  ON public.security_import_execution_jobs (status, lease_expires_at);
CREATE INDEX IF NOT EXISTS security_import_execution_actor_time_idx
  ON public.security_import_execution_jobs (actor_id, created_at DESC);

ALTER TABLE public.security_import_execution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_import_execution_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_import_execution_jobs
  FROM PUBLIC, anon, authenticated, service_role;

-- A retry of the settlement import reuses the same domain job and history row.
-- Historical rows remain untouched because the new reference is nullable.
ALTER TABLE public.import_history
  ADD COLUMN IF NOT EXISTS security_execution_id uuid
  REFERENCES public.security_import_execution_jobs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS import_history_security_execution_unique
  ON public.import_history (security_execution_id)
  WHERE security_execution_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.phase_f_claim_import_execution(
  p_operation text,
  p_actor_id uuid,
  p_tenant_scope_id uuid,
  p_idempotency_key_hash text,
  p_payload_fingerprint text,
  p_lease_seconds integer,
  p_correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_job public.security_import_execution_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('settlements_csv', 'drivers_csv')
     OR p_actor_id IS NULL OR p_tenant_scope_id IS NULL OR p_correlation_id IS NULL
     OR p_idempotency_key_hash IS NULL OR p_idempotency_key_hash !~ '^[0-9a-f]{64}$'
     OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_lease_seconds NOT BETWEEN 60 AND 3600 THEN
    RAISE EXCEPTION 'invalid_import_claim' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles AS role_row
    WHERE role_row.user_id = p_actor_id
      AND role_row.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'import_admin_required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cities AS city WHERE city.id = p_tenant_scope_id
  ) THEN
    RAISE EXCEPTION 'import_scope_not_found' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.security_import_execution_jobs (
    operation, actor_id, tenant_scope_id, idempotency_key_hash,
    payload_fingerprint, status, attempts, correlation_id,
    claimed_at, lease_expires_at, updated_at
  ) VALUES (
    p_operation, p_actor_id, p_tenant_scope_id, p_idempotency_key_hash,
    p_payload_fingerprint, 'processing', 1, p_correlation_id,
    v_now, v_now + make_interval(secs => p_lease_seconds), v_now
  )
  ON CONFLICT (operation, tenant_scope_id, idempotency_key_hash)
    DO NOTHING
  RETURNING * INTO v_job;

  IF FOUND THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, NULL, 'admin.import_execution.claim', 'import_execution', v_job.id::text,
      'attempted', p_correlation_id,
      jsonb_build_object(
        'operation', p_operation,
        'scope_type', 'city',
        'scope_id', p_tenant_scope_id,
        'attempt', 1
      )
    );
    RETURN jsonb_build_object(
      'decision', 'claimed',
      'execution_id', v_job.id,
      'attempt', 1
    );
  END IF;

  SELECT * INTO v_job
  FROM public.security_import_execution_jobs
  WHERE operation = p_operation
    AND tenant_scope_id = p_tenant_scope_id
    AND idempotency_key_hash = p_idempotency_key_hash
  FOR UPDATE;

  IF v_job.actor_id IS DISTINCT FROM p_actor_id THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, NULL, 'admin.import_execution.claim', 'import_execution', v_job.id::text,
      'denied', p_correlation_id,
      jsonb_build_object(
        'operation', p_operation,
        'scope_type', 'city',
        'scope_id', p_tenant_scope_id,
        'reason', 'actor_binding_mismatch'
      )
    );
    RETURN jsonb_build_object('decision', 'actor_mismatch', 'execution_id', v_job.id);
  END IF;

  IF v_job.payload_fingerprint IS DISTINCT FROM p_payload_fingerprint THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, NULL, 'admin.import_execution.claim', 'import_execution', v_job.id::text,
      'denied', p_correlation_id,
      jsonb_build_object(
        'operation', p_operation,
        'scope_type', 'city',
        'scope_id', p_tenant_scope_id,
        'reason', 'idempotency_payload_mismatch'
      )
    );
    RETURN jsonb_build_object('decision', 'payload_mismatch', 'execution_id', v_job.id);
  END IF;

  IF v_job.status = 'succeeded' THEN
    RETURN jsonb_build_object(
      'decision', 'succeeded',
      'execution_id', v_job.id,
      'result_summary', COALESCE(v_job.result_summary, '{}'::jsonb)
    );
  END IF;
  IF v_job.status = 'processing' AND v_job.lease_expires_at > v_now THEN
    RETURN jsonb_build_object('decision', 'in_progress', 'execution_id', v_job.id);
  END IF;
  IF v_job.attempts >= 5 THEN
    RETURN jsonb_build_object('decision', 'retry_exhausted', 'execution_id', v_job.id);
  END IF;

  UPDATE public.security_import_execution_jobs
  SET status = 'processing',
      attempts = attempts + 1,
      correlation_id = p_correlation_id,
      claimed_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      completed_at = NULL,
      result_summary = NULL,
      last_error_code = NULL,
      updated_at = v_now
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, NULL, 'admin.import_execution.claim', 'import_execution', v_job.id::text,
    'attempted', p_correlation_id,
    jsonb_build_object(
      'operation', p_operation,
      'scope_type', 'city',
      'scope_id', p_tenant_scope_id,
      'attempt', v_job.attempts,
      'retry', true
    )
  );
  RETURN jsonb_build_object(
    'decision', 'claimed',
    'execution_id', v_job.id,
    'attempt', v_job.attempts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.phase_f_finalize_import_execution(
  p_execution_id uuid,
  p_operation text,
  p_actor_id uuid,
  p_tenant_scope_id uuid,
  p_idempotency_key_hash text,
  p_payload_fingerprint text,
  p_correlation_id uuid,
  p_succeeded boolean,
  p_result_summary jsonb DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text := CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_execution_id IS NULL OR p_actor_id IS NULL OR p_tenant_scope_id IS NULL
     OR p_correlation_id IS NULL OR p_succeeded IS NULL
     OR p_operation IS NULL OR p_operation NOT IN ('settlements_csv', 'drivers_csv')
     OR p_idempotency_key_hash IS NULL OR p_idempotency_key_hash !~ '^[0-9a-f]{64}$'
     OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[0-9a-f]{64}$'
     OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_:-]{1,80}$') THEN
    RAISE EXCEPTION 'invalid_import_finalize' USING ERRCODE = '22023';
  END IF;
  IF p_succeeded AND (
    p_result_summary IS NULL
    OR jsonb_typeof(p_result_summary) IS DISTINCT FROM 'object'
    OR octet_length(p_result_summary::text) > 2048
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_result_summary) AS result_key(key)
      WHERE result_key.key NOT IN (
        'total', 'added', 'updated', 'errors', 'newDrivers',
        'matchedDrivers', 'isFirstImport', 'imported'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(p_result_summary) AS result_value(key, value)
      WHERE jsonb_typeof(result_value.value) NOT IN ('number', 'boolean')
    )
  ) THEN
    RAISE EXCEPTION 'unsafe_import_result_summary' USING ERRCODE = '22023';
  END IF;
  IF NOT p_succeeded AND p_result_summary IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_import_result_summary' USING ERRCODE = '22023';
  END IF;

  UPDATE public.security_import_execution_jobs
  SET status = v_status,
      completed_at = clock_timestamp(),
      lease_expires_at = clock_timestamp(),
      result_summary = CASE WHEN p_succeeded THEN p_result_summary ELSE NULL END,
      last_error_code = CASE WHEN p_succeeded THEN NULL ELSE COALESCE(p_error_code, 'unknown_error') END,
      updated_at = clock_timestamp()
  WHERE id = p_execution_id
    AND operation = p_operation
    AND actor_id = p_actor_id
    AND tenant_scope_id = p_tenant_scope_id
    AND idempotency_key_hash = p_idempotency_key_hash
    AND payload_fingerprint = p_payload_fingerprint
    AND correlation_id = p_correlation_id
    AND status = 'processing';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, NULL, 'admin.import_execution', 'import_execution', p_execution_id::text,
    CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
    p_correlation_id,
    CASE
      WHEN p_succeeded THEN p_result_summary || jsonb_build_object(
        'operation', p_operation,
        'scope_type', 'city',
        'scope_id', p_tenant_scope_id
      )
      ELSE jsonb_build_object(
        'operation', p_operation,
        'scope_type', 'city',
        'scope_id', p_tenant_scope_id,
        'error_code', COALESCE(p_error_code, 'unknown_error')
      )
    END
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_f_claim_import_execution(
  text, uuid, uuid, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_f_claim_import_execution(
  text, uuid, uuid, text, text, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.phase_f_finalize_import_execution(
  uuid, text, uuid, uuid, text, text, uuid, boolean, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_f_finalize_import_execution(
  uuid, text, uuid, uuid, text, text, uuid, boolean, jsonb, text
) TO service_role;

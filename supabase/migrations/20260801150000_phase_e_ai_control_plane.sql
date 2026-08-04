-- Phase E: fail-closed control plane for AI agents and tool execution.
--
-- This migration only introduces data-plane foundations. It does not enable
-- telephony or tool execution. Existing agents remain stopped until a trusted
-- server command configures finite limits and releases both kill switches.

-- ---------------------------------------------------------------------------
-- 1. Per-agent runtime controls
-- ---------------------------------------------------------------------------

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS kill_switch_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dry_run_tools boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_concurrent_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_tool_calls_per_conversation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_write_tool_calls_per_conversation integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_tool_call_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_cost_limit_microusd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_cost_limit_microusd bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.voice_agent_configs.kill_switch_enabled IS
  'Fail-closed per-agent stop. May be released only by a trusted, reauthorizing server command.';
COMMENT ON COLUMN public.voice_agent_configs.dry_run_tools IS
  'When true every tool must be simulated and no production side effect is permitted.';
COMMENT ON COLUMN public.voice_agent_configs.max_tool_calls_per_conversation IS
  'Zero means that live tool execution is disabled, never unlimited.';
COMMENT ON COLUMN public.voice_agent_configs.max_write_tool_calls_per_conversation IS
  'Zero means that write tools are disabled, never unlimited.';
COMMENT ON COLUMN public.voice_agent_configs.daily_tool_call_limit IS
  'Zero means that live tool execution is disabled, never unlimited.';
COMMENT ON COLUMN public.voice_agent_configs.conversation_cost_limit_microusd IS
  'Hard conversation budget in millionths of USD; zero disables paid live execution.';
COMMENT ON COLUMN public.voice_agent_configs.daily_cost_limit_microusd IS
  'Hard daily budget in millionths of USD; zero disables paid live execution.';

DO $phase_e_voice_agent_config_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'voice_agent_configs_phase_e_runtime_limits_check'
      AND conrelid = 'public.voice_agent_configs'::regclass
  ) THEN
    ALTER TABLE public.voice_agent_configs
      ADD CONSTRAINT voice_agent_configs_phase_e_runtime_limits_check CHECK (
        max_concurrent_calls BETWEEN 0 AND 1000
        AND max_tool_calls_per_conversation BETWEEN 0 AND 100
        AND max_write_tool_calls_per_conversation BETWEEN 0 AND 25
        AND max_write_tool_calls_per_conversation <= max_tool_calls_per_conversation
        AND daily_tool_call_limit BETWEEN 0 AND 1000000
        AND conversation_cost_limit_microusd BETWEEN 0 AND 1000000000000
        AND daily_cost_limit_microusd BETWEEN 0 AND 1000000000000
      );
  END IF;
END;
$phase_e_voice_agent_config_constraints$;

CREATE OR REPLACE FUNCTION public.phase_e_protect_voice_agent_runtime_controls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.persona_key IS DISTINCT FROM OLD.persona_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'voice_agent_tenant_anchor_is_immutable' USING ERRCODE = '42501';
  END IF;

  -- Browser sessions may always make an agent safer. Releasing a stop,
  -- increasing a budget or enabling a privileged integration requires a
  -- trusted endpoint which reauthorizes the actor and writes an audit event.
  IF auth.role() IN ('authenticated', 'service_role') THEN
    IF TG_OP = 'INSERT' AND (
      NEW.kill_switch_enabled IS DISTINCT FROM true
      OR NEW.dry_run_tools IS DISTINCT FROM true
      OR NEW.max_concurrent_calls <> 0
      OR NEW.max_tool_calls_per_conversation <> 0
      OR NEW.max_write_tool_calls_per_conversation <> 0
      OR NEW.daily_tool_call_limit <> 0
      OR NEW.conversation_cost_limit_microusd <> 0
      OR NEW.daily_cost_limit_microusd <> 0
      OR NEW.is_active IS DISTINCT FROM false
      OR NEW.outbound_enabled IS DISTINCT FROM false
      OR NEW.calendar_access IS DISTINCT FROM false
      OR NEW.orders_access IS DISTINCT FROM false
      OR NEW.privacy_confirmed IS DISTINCT FROM false
      OR NEW.custom_prompt_override IS NOT NULL
      OR NEW.twilio_number IS NOT NULL
      OR NEW.twilio_subaccount_sid IS NOT NULL
      OR NEW.byo_caller_id IS NOT NULL
      OR NEW.elevenlabs_agent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'voice_agent_privileged_control_requires_server_authorization'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' AND (
      (OLD.kill_switch_enabled AND NOT NEW.kill_switch_enabled)
      OR (OLD.dry_run_tools AND NOT NEW.dry_run_tools)
      OR NEW.max_concurrent_calls > OLD.max_concurrent_calls
      OR NEW.max_tool_calls_per_conversation > OLD.max_tool_calls_per_conversation
      OR NEW.max_write_tool_calls_per_conversation > OLD.max_write_tool_calls_per_conversation
      OR NEW.daily_tool_call_limit > OLD.daily_tool_call_limit
      OR NEW.conversation_cost_limit_microusd > OLD.conversation_cost_limit_microusd
      OR NEW.daily_cost_limit_microusd > OLD.daily_cost_limit_microusd
      OR (NOT OLD.is_active AND NEW.is_active)
      OR (NOT OLD.outbound_enabled AND NEW.outbound_enabled)
      OR (NOT OLD.calendar_access AND NEW.calendar_access)
      OR (NOT OLD.orders_access AND NEW.orders_access)
      OR (NOT OLD.privacy_confirmed AND NEW.privacy_confirmed)
      OR NEW.custom_prompt_override IS DISTINCT FROM OLD.custom_prompt_override
      OR NEW.twilio_number IS DISTINCT FROM OLD.twilio_number
      OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
      OR NEW.byo_caller_id IS DISTINCT FROM OLD.byo_caller_id
      OR NEW.elevenlabs_agent_id IS DISTINCT FROM OLD.elevenlabs_agent_id
    ) AND (
      auth.role() = 'authenticated'
      OR current_setting(
        'rido.phase_e_runtime_authorization', true
      ) IS DISTINCT FROM NEW.id::text
    ) THEN
      RAISE EXCEPTION 'voice_agent_privileged_control_requires_server_authorization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_protect_voice_agent_runtime_controls()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_e_protect_voice_agent_runtime_controls
  ON public.voice_agent_configs;
CREATE TRIGGER phase_e_protect_voice_agent_runtime_controls
  BEFORE INSERT OR UPDATE ON public.voice_agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.phase_e_protect_voice_agent_runtime_controls();

-- ---------------------------------------------------------------------------
-- 2. Global emergency stop
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_global_runtime_control (
  control_key text PRIMARY KEY DEFAULT 'global'
    CHECK (control_key = 'global'),
  kill_switch_enabled boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT 'phase_e_configuration_required'
    CHECK (length(reason) BETWEEN 1 AND 500),
  changed_by_actor_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_global_runtime_control (
  control_key, kill_switch_enabled, reason
) VALUES (
  'global', true, 'phase_e_configuration_required'
) ON CONFLICT (control_key) DO NOTHING;

ALTER TABLE public.ai_global_runtime_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_global_runtime_control FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_global_runtime_control
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_global_runtime_control TO authenticated;
GRANT SELECT ON TABLE public.ai_global_runtime_control TO service_role;

DROP POLICY IF EXISTS phase_e_ai_global_runtime_control_admin_read
  ON public.ai_global_runtime_control;
CREATE POLICY phase_e_ai_global_runtime_control_admin_read
  ON public.ai_global_runtime_control FOR SELECT TO authenticated
  USING (public.phase_c_is_system_admin());

CREATE OR REPLACE FUNCTION public.phase_e_protect_global_runtime_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'global_ai_runtime_control_is_required' USING ERRCODE = '42501';
  END IF;
  IF NEW.control_key IS DISTINCT FROM OLD.control_key THEN
    RAISE EXCEPTION 'global_ai_runtime_control_key_is_immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.kill_switch_enabled AND NOT NEW.kill_switch_enabled
     AND (NEW.changed_by_actor_id IS NULL OR length(trim(NEW.reason)) < 8) THEN
    RAISE EXCEPTION 'global_ai_runtime_release_requires_actor_and_reason'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_protect_global_runtime_control()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_e_protect_global_runtime_control
  ON public.ai_global_runtime_control;
CREATE TRIGGER phase_e_protect_global_runtime_control
  BEFORE UPDATE OR DELETE ON public.ai_global_runtime_control
  FOR EACH ROW EXECUTE FUNCTION public.phase_e_protect_global_runtime_control();

CREATE OR REPLACE FUNCTION public.phase_e_set_global_ai_kill_switch(
  p_kill_switch_enabled boolean,
  p_actor_id uuid,
  p_reason text,
  p_correlation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous_value boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_kill_switch_enabled IS NULL OR p_actor_id IS NULL
     OR p_correlation_id IS NULL
     OR length(pg_catalog.btrim(coalesce(p_reason, ''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'invalid_global_ai_runtime_change' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_role(p_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'system_admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT runtime.kill_switch_enabled INTO v_previous_value
  FROM public.ai_global_runtime_control AS runtime
  WHERE runtime.control_key = 'global'
  FOR UPDATE OF runtime;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'global_ai_runtime_control_missing' USING ERRCODE = '55000';
  END IF;

  UPDATE public.ai_global_runtime_control
  SET kill_switch_enabled = p_kill_switch_enabled,
      reason = pg_catalog.btrim(p_reason),
      changed_by_actor_id = p_actor_id
  WHERE control_key = 'global';

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, NULL, 'ai.global_runtime_control.change',
    'ai_global_runtime_control', 'global', 'succeeded', p_correlation_id,
    pg_catalog.jsonb_build_object(
      'previous_kill_switch_enabled', v_previous_value,
      'kill_switch_enabled', p_kill_switch_enabled,
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  RETURN p_kill_switch_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_set_global_ai_kill_switch(
  boolean,uuid,text,uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_set_global_ai_kill_switch(
  boolean,uuid,text,uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Atomic tool claims and immutable execution ledger
-- ---------------------------------------------------------------------------

-- A claim is acquired before a write-side effect. A lost response never
-- causes automatic lease takeover: a stale processing claim requires manual
-- reconciliation, which is safer than executing the same action twice.
CREATE TABLE IF NOT EXISTS public.ai_tool_execution_claims (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  provider_id uuid NOT NULL,
  voice_config_id uuid NOT NULL,
  actor_id uuid,
  call_id uuid,
  conversation_id text NOT NULL
    CHECK (length(conversation_id) BETWEEN 1 AND 255),
  correlation_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  tool_name text NOT NULL CHECK (length(tool_name) BETWEEN 1 AND 120),
  risk_class text NOT NULL CHECK (risk_class IN (
    'read_only', 'write_low', 'write_high',
    'financial', 'legal', 'destructive'
  )),
  execution_mode text NOT NULL CHECK (execution_mode IN ('dry_run', 'live')),
  estimated_cost_microusd bigint NOT NULL DEFAULT 0
    CHECK (estimated_cost_microusd >= 0),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN (
    'processing', 'dry_run', 'succeeded', 'denied', 'failed'
  )),
  lease_token uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  lease_expires_at timestamptz NOT NULL,
  ledger_id uuid,
  result_code text CHECK (result_code IS NULL OR length(result_code) <= 120),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT ai_tool_execution_claims_provider_idempotency_unique
    UNIQUE (provider_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_tool_execution_claims_config_day_idx
  ON public.ai_tool_execution_claims (voice_config_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS ai_tool_execution_claims_conversation_idx
  ON public.ai_tool_execution_claims (
    provider_id, voice_config_id, conversation_id, claimed_at
  );
CREATE INDEX IF NOT EXISTS ai_tool_execution_claims_stale_idx
  ON public.ai_tool_execution_claims (lease_expires_at)
  WHERE status = 'processing';

ALTER TABLE public.ai_tool_execution_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_execution_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_tool_execution_claims
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.ai_tool_execution_ledger (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE
    REFERENCES public.ai_tool_execution_claims(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL,
  voice_config_id uuid NOT NULL,
  actor_id uuid,
  call_id uuid,
  conversation_id text NOT NULL
    CHECK (length(conversation_id) BETWEEN 1 AND 255),
  correlation_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  tool_name text NOT NULL CHECK (length(tool_name) BETWEEN 1 AND 120),
  risk_class text NOT NULL CHECK (risk_class IN (
    'read_only', 'write_low', 'write_high',
    'financial', 'legal', 'destructive'
  )),
  execution_mode text NOT NULL DEFAULT 'dry_run'
    CHECK (execution_mode IN ('dry_run', 'live')),
  status text NOT NULL CHECK (status IN (
    'dry_run', 'succeeded', 'denied', 'failed'
  )),
  request_fingerprint text NOT NULL
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  resource_type text CHECK (resource_type IS NULL OR length(resource_type) <= 120),
  resource_id text CHECK (resource_id IS NULL OR length(resource_id) <= 255),
  result_code text CHECK (result_code IS NULL OR length(result_code) <= 120),
  cost_microusd bigint NOT NULL DEFAULT 0 CHECK (cost_microusd >= 0),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(safe_metadata) = 'object'
    AND octet_length(safe_metadata::text) <= 8192
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_tool_execution_ledger_mode_status_check CHECK (
    (execution_mode = 'dry_run' AND status = 'dry_run')
    OR (execution_mode = 'live' AND status IN ('succeeded', 'denied', 'failed'))
  ),
  CONSTRAINT ai_tool_execution_ledger_provider_idempotency_unique
    UNIQUE (provider_id, idempotency_key)
);

COMMENT ON TABLE public.ai_tool_execution_ledger IS
  'Append-only terminal record of one tool attempt. Payloads, prompts, credentials and secrets are forbidden from safe_metadata.';

CREATE INDEX IF NOT EXISTS ai_tool_execution_ledger_provider_time_idx
  ON public.ai_tool_execution_ledger (provider_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_tool_execution_ledger_conversation_idx
  ON public.ai_tool_execution_ledger (provider_id, conversation_id, occurred_at);
CREATE INDEX IF NOT EXISTS ai_tool_execution_ledger_correlation_idx
  ON public.ai_tool_execution_ledger (correlation_id);

ALTER TABLE public.ai_tool_execution_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_execution_ledger FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_tool_execution_ledger
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_tool_execution_ledger TO authenticated;
GRANT SELECT ON TABLE public.ai_tool_execution_ledger TO service_role;

DROP POLICY IF EXISTS phase_e_ai_tool_execution_ledger_tenant_read
  ON public.ai_tool_execution_ledger;
CREATE POLICY phase_e_ai_tool_execution_ledger_tenant_read
  ON public.ai_tool_execution_ledger FOR SELECT TO authenticated
  USING (public.phase_c_can_access_provider(provider_id));

CREATE OR REPLACE FUNCTION public.phase_e_validate_ai_tool_ledger_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.ai_tool_execution_claims AS claim
    WHERE claim.id = NEW.claim_id
      AND claim.status = 'processing'
      AND claim.provider_id = NEW.provider_id
      AND claim.voice_config_id = NEW.voice_config_id
      AND claim.actor_id IS NOT DISTINCT FROM NEW.actor_id
      AND claim.call_id IS NOT DISTINCT FROM NEW.call_id
      AND claim.conversation_id = NEW.conversation_id
      AND claim.correlation_id = NEW.correlation_id
      AND claim.idempotency_key = NEW.idempotency_key
      AND claim.request_fingerprint IS NOT DISTINCT FROM NEW.request_fingerprint
      AND claim.tool_name = NEW.tool_name
      AND claim.risk_class = NEW.risk_class
      AND claim.execution_mode = NEW.execution_mode
  ) THEN
    RAISE EXCEPTION 'ai_tool_ledger_requires_matching_processing_claim'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.voice_config_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.voice_agent_configs AS config
    WHERE config.id = NEW.voice_config_id
      AND config.provider_id = NEW.provider_id
  ) THEN
    RAISE EXCEPTION 'ai_tool_ledger_config_provider_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.call_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.voice_calls AS call
    WHERE call.id = NEW.call_id
      AND call.provider_id = NEW.provider_id
  ) THEN
    RAISE EXCEPTION 'ai_tool_ledger_call_provider_mismatch'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_validate_ai_tool_ledger_insert()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_e_validate_ai_tool_ledger_insert
  ON public.ai_tool_execution_ledger;
CREATE TRIGGER phase_e_validate_ai_tool_ledger_insert
  BEFORE INSERT ON public.ai_tool_execution_ledger
  FOR EACH ROW EXECUTE FUNCTION public.phase_e_validate_ai_tool_ledger_insert();

CREATE OR REPLACE FUNCTION public.phase_e_reject_ai_tool_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'ai_tool_execution_ledger_is_append_only' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_reject_ai_tool_ledger_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_e_reject_ai_tool_ledger_mutation
  ON public.ai_tool_execution_ledger;
CREATE TRIGGER phase_e_reject_ai_tool_ledger_mutation
  BEFORE UPDATE OR DELETE ON public.ai_tool_execution_ledger
  FOR EACH ROW EXECUTE FUNCTION public.phase_e_reject_ai_tool_ledger_mutation();

CREATE OR REPLACE FUNCTION public.phase_e_claim_ai_tool_execution(
  p_provider_id uuid,
  p_voice_config_id uuid,
  p_actor_id uuid,
  p_call_id uuid,
  p_conversation_id text,
  p_correlation_id uuid,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_tool_name text,
  p_risk_class text,
  p_execution_mode text,
  p_estimated_cost_microusd bigint,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE(
  claim_id uuid,
  disposition text,
  claim_status text,
  lease_token uuid,
  ledger_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.ai_tool_execution_claims%ROWTYPE;
  v_config public.voice_agent_configs%ROWTYPE;
  v_now timestamptz := statement_timestamp();
  v_claim_id uuid := extensions.gen_random_uuid();
  v_lease_token uuid := extensions.gen_random_uuid();
  v_conversation_calls bigint;
  v_conversation_writes bigint;
  v_conversation_cost bigint;
  v_daily_calls bigint;
  v_daily_cost bigint;
  v_tenant_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_provider_id IS NULL OR p_voice_config_id IS NULL
     OR p_correlation_id IS NULL OR p_idempotency_key IS NULL
     OR p_conversation_id IS NULL OR p_tool_name IS NULL
     OR p_request_fingerprint IS NULL OR p_risk_class IS NULL
     OR p_execution_mode IS NULL OR p_lease_seconds IS NULL
     OR p_conversation_id !~ '^[A-Za-z0-9._:-]{1,255}$'
     OR p_tool_name !~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
     OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_risk_class NOT IN (
       'read_only', 'write_low', 'write_high',
       'financial', 'legal', 'destructive'
     )
     OR p_execution_mode NOT IN ('dry_run', 'live')
     OR p_estimated_cost_microusd IS NULL
     OR p_estimated_cost_microusd NOT BETWEEN 0 AND 1000000000000
     OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'invalid_ai_tool_claim' USING ERRCODE = '22023';
  END IF;

  -- One lock serializes budget checks and claims for this agent. The unique
  -- provider/idempotency constraint remains the final concurrent replay gate.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase-e-ai-tool:' || p_provider_id::text || ':' || p_voice_config_id::text,
      0
    )
  );

  SELECT config.* INTO v_config
  FROM public.voice_agent_configs AS config
  WHERE config.id = p_voice_config_id
    AND config.provider_id = p_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_tool_config_provider_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT provider.company_id INTO v_tenant_id
  FROM public.service_providers AS provider
  WHERE provider.id = p_provider_id
    AND provider.status IS DISTINCT FROM 'suspended'
    AND (
      provider.company_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.companies AS active_company
        WHERE active_company.id = provider.company_id
          AND active_company.status = 'active'
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_tool_provider_not_available' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL AND NOT (
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.service_providers AS provider
      WHERE provider.id = p_provider_id
        AND (
          provider.user_id = p_actor_id
          OR EXISTS (
            SELECT 1 FROM public.companies AS company
            WHERE company.id = provider.company_id
              AND company.status = 'active'
              AND company.owner_user_id = p_actor_id
          )
          OR EXISTS (
            SELECT 1 FROM public.company_members AS member
            WHERE member.company_id = provider.company_id
              AND member.user_id = p_actor_id
              AND member.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.service_employees AS employee
            WHERE employee.provider_id = provider.id
              AND employee.user_id = p_actor_id
              AND employee.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM public.workshop_employees AS employee
            WHERE employee.provider_id = provider.id
              AND employee.user_id = p_actor_id
              AND employee.status = 'active'
          )
        )
    )
  ) THEN
    RAISE EXCEPTION 'ai_tool_actor_provider_mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_call_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.voice_calls AS call
    WHERE call.id = p_call_id
      AND call.provider_id = p_provider_id
      AND (call.config_id IS NULL OR call.config_id = p_voice_config_id)
      AND (
        NULLIF(pg_catalog.btrim(call.elevenlabs_conversation_id), '') IS NULL
        OR NULLIF(pg_catalog.btrim(call.elevenlabs_conversation_id), '')
          = p_conversation_id
      )
  ) THEN
    RAISE EXCEPTION 'ai_tool_call_provider_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT claim.* INTO v_existing
  FROM public.ai_tool_execution_claims AS claim
  WHERE claim.provider_id = p_provider_id
    AND claim.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.voice_config_id IS DISTINCT FROM p_voice_config_id
       OR v_existing.actor_id IS DISTINCT FROM p_actor_id
       OR v_existing.call_id IS DISTINCT FROM p_call_id
       OR v_existing.conversation_id IS DISTINCT FROM p_conversation_id
       OR v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint
       OR v_existing.tool_name IS DISTINCT FROM p_tool_name
       OR v_existing.risk_class IS DISTINCT FROM p_risk_class
       OR v_existing.execution_mode IS DISTINCT FROM p_execution_mode THEN
      RAISE EXCEPTION 'ai_tool_idempotency_payload_mismatch'
        USING ERRCODE = '23505';
    END IF;

    claim_id := v_existing.id;
    claim_status := v_existing.status;
    lease_token := NULL;
    ledger_id := v_existing.ledger_id;
    disposition := CASE
      WHEN v_existing.status <> 'processing' THEN 'replay_terminal'
      WHEN v_existing.lease_expires_at > v_now THEN 'already_processing'
      ELSE 'stale_processing_manual_recovery'
    END;

    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, v_tenant_id, 'ai.tool_execution.claim_replay',
      'ai_tool_execution_claim', v_existing.id::text,
      CASE WHEN v_existing.status <> 'processing' THEN 'succeeded' ELSE 'denied' END,
      p_correlation_id,
      pg_catalog.jsonb_build_object(
        'tool_name', p_tool_name,
        'disposition', disposition,
        'risk_class', p_risk_class,
        'execution_mode', p_execution_mode
      )
    );
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_execution_mode = 'live' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ai_global_runtime_control AS global_control
      WHERE global_control.control_key = 'global'
        AND global_control.kill_switch_enabled = false
    ) OR v_config.kill_switch_enabled
       OR v_config.dry_run_tools
       OR NOT v_config.is_active
       OR NOT v_config.privacy_confirmed
       OR v_config.max_concurrent_calls <= 0
       OR v_config.max_tool_calls_per_conversation <= 0
       OR v_config.daily_tool_call_limit <= 0
       OR (
         p_risk_class <> 'read_only'
         AND v_config.max_write_tool_calls_per_conversation <= 0
       ) THEN
      RAISE EXCEPTION 'ai_live_tool_execution_is_not_enabled'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE claim.risk_class <> 'read_only'),
    coalesce(sum(claim.estimated_cost_microusd), 0)
  INTO v_conversation_calls, v_conversation_writes, v_conversation_cost
  FROM public.ai_tool_execution_claims AS claim
  WHERE claim.provider_id = p_provider_id
    AND claim.voice_config_id = p_voice_config_id
    AND claim.conversation_id = p_conversation_id
    AND claim.execution_mode = 'live';

  SELECT count(*), coalesce(sum(claim.estimated_cost_microusd), 0)
    INTO v_daily_calls, v_daily_cost
  FROM public.ai_tool_execution_claims AS claim
  WHERE claim.provider_id = p_provider_id
    AND claim.voice_config_id = p_voice_config_id
    AND claim.execution_mode = 'live'
    AND claim.claimed_at >= date_trunc('day', v_now);

  IF p_execution_mode = 'live' AND (
    v_conversation_calls >= v_config.max_tool_calls_per_conversation
    OR (
      p_risk_class <> 'read_only'
      AND v_conversation_writes >= v_config.max_write_tool_calls_per_conversation
    )
    OR v_daily_calls >= v_config.daily_tool_call_limit
    OR (
      p_estimated_cost_microusd > 0
      AND (
        v_config.conversation_cost_limit_microusd <= 0
        OR v_config.daily_cost_limit_microusd <= 0
        OR v_conversation_cost + p_estimated_cost_microusd
          > v_config.conversation_cost_limit_microusd
        OR v_daily_cost + p_estimated_cost_microusd
          > v_config.daily_cost_limit_microusd
      )
    )
  ) THEN
    RAISE EXCEPTION 'ai_tool_execution_limit_exceeded' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_tool_execution_claims (
    id, provider_id, voice_config_id, actor_id, call_id, conversation_id,
    correlation_id, idempotency_key, request_fingerprint, tool_name,
    risk_class, execution_mode, estimated_cost_microusd, status,
    lease_token, lease_expires_at
  ) VALUES (
    v_claim_id, p_provider_id, p_voice_config_id, p_actor_id, p_call_id,
    p_conversation_id, p_correlation_id, p_idempotency_key,
    p_request_fingerprint, p_tool_name, p_risk_class, p_execution_mode,
    p_estimated_cost_microusd, 'processing', v_lease_token,
    v_now + make_interval(secs => p_lease_seconds)
  );

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, v_tenant_id, 'ai.tool_execution.claim',
    'ai_tool_execution_claim', v_claim_id::text,
    'succeeded', p_correlation_id,
    pg_catalog.jsonb_build_object(
      'tool_name', p_tool_name,
      'risk_class', p_risk_class,
      'execution_mode', p_execution_mode
    )
  );

  claim_id := v_claim_id;
  disposition := 'acquired';
  claim_status := 'processing';
  lease_token := v_lease_token;
  ledger_id := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_claim_ai_tool_execution(
  uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_claim_ai_tool_execution(
  uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.phase_e_finalize_ai_tool_execution(
  p_claim_id uuid,
  p_lease_token uuid,
  p_status text,
  p_result_code text,
  p_resource_type text,
  p_resource_id text,
  p_cost_microusd bigint,
  p_safe_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_claim public.ai_tool_execution_claims%ROWTYPE;
  v_existing_ledger public.ai_tool_execution_ledger%ROWTYPE;
  v_ledger_id uuid;
  v_tenant_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_claim_id IS NULL OR p_lease_token IS NULL
     OR p_status IS NULL
     OR p_status NOT IN ('dry_run', 'succeeded', 'denied', 'failed')
     OR p_cost_microusd IS NULL
     OR p_cost_microusd NOT BETWEEN 0 AND 1000000000000
     OR (p_result_code IS NOT NULL AND length(p_result_code) > 120)
     OR (p_resource_type IS NOT NULL AND length(p_resource_type) > 120)
     OR (p_resource_id IS NOT NULL AND length(p_resource_id) > 255)
     OR p_safe_metadata IS NULL
     OR jsonb_typeof(p_safe_metadata) <> 'object'
     OR octet_length(p_safe_metadata::text) > 8192
     OR p_safe_metadata::text ~* '"[^"]*(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)[^"]*"[[:space:]]*:' THEN
    RAISE EXCEPTION 'invalid_ai_tool_finalization' USING ERRCODE = '22023';
  END IF;

  SELECT claim.* INTO v_claim
  FROM public.ai_tool_execution_claims AS claim
  WHERE claim.id = p_claim_id
  FOR UPDATE;
  IF NOT FOUND OR v_claim.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'ai_tool_claim_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT provider.company_id INTO v_tenant_id
  FROM public.service_providers AS provider
  WHERE provider.id = v_claim.provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_tool_provider_not_available' USING ERRCODE = '42501';
  END IF;

  IF v_claim.status <> 'processing' THEN
    SELECT ledger.* INTO v_existing_ledger
    FROM public.ai_tool_execution_ledger AS ledger
    WHERE ledger.id = v_claim.ledger_id
      AND ledger.claim_id = v_claim.id;
    IF NOT FOUND
       OR v_claim.status IS DISTINCT FROM p_status
       OR v_existing_ledger.status IS DISTINCT FROM p_status
       OR v_existing_ledger.result_code IS DISTINCT FROM p_result_code
       OR v_existing_ledger.resource_type IS DISTINCT FROM p_resource_type
       OR v_existing_ledger.resource_id IS DISTINCT FROM p_resource_id
       OR v_existing_ledger.cost_microusd IS DISTINCT FROM p_cost_microusd
       OR v_existing_ledger.safe_metadata IS DISTINCT FROM p_safe_metadata THEN
      RAISE EXCEPTION 'ai_tool_finalization_payload_mismatch'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_claim.ledger_id;
  END IF;

  IF (v_claim.execution_mode = 'dry_run' AND p_status <> 'dry_run')
     OR (v_claim.execution_mode = 'live' AND p_status = 'dry_run') THEN
    RAISE EXCEPTION 'ai_tool_finalization_mode_mismatch' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_tool_execution_ledger (
    claim_id, provider_id, voice_config_id, actor_id, call_id,
    conversation_id, correlation_id, idempotency_key, tool_name, risk_class,
    execution_mode, status, request_fingerprint, resource_type, resource_id,
    result_code, cost_microusd, safe_metadata
  ) VALUES (
    v_claim.id, v_claim.provider_id, v_claim.voice_config_id, v_claim.actor_id,
    v_claim.call_id, v_claim.conversation_id, v_claim.correlation_id,
    v_claim.idempotency_key, v_claim.tool_name, v_claim.risk_class,
    v_claim.execution_mode, p_status, v_claim.request_fingerprint,
    p_resource_type, p_resource_id, p_result_code, p_cost_microusd,
    p_safe_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.ai_tool_execution_claims
  SET status = p_status,
      ledger_id = v_ledger_id,
      result_code = p_result_code,
      finalized_at = statement_timestamp()
  WHERE id = v_claim.id;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    v_claim.actor_id, v_tenant_id, 'ai.tool_execution.finalize',
    'ai_tool_execution_claim', v_claim.id::text,
    CASE WHEN p_status IN ('succeeded', 'dry_run') THEN 'succeeded'
         WHEN p_status = 'denied' THEN 'denied'
         ELSE 'failed' END,
    v_claim.correlation_id,
    pg_catalog.jsonb_build_object(
      'tool_name', v_claim.tool_name,
      'risk_class', v_claim.risk_class,
      'status', p_status,
      'execution_mode', v_claim.execution_mode
    )
  );

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_finalize_ai_tool_execution(
  uuid,uuid,text,text,text,text,bigint,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_finalize_ai_tool_execution(
  uuid,uuid,text,text,text,text,bigint,jsonb
) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Versioned knowledge/script proposal queue with human approval
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_content_change_proposals (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  provider_id uuid NOT NULL,
  voice_config_id uuid,
  content_key uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('knowledge', 'script')),
  version_number integer NOT NULL CHECK (version_number > 0),
  base_version_number integer NOT NULL DEFAULT 0 CHECK (base_version_number >= 0),
  target_resource_id uuid,
  source_call_id uuid,
  source_conversation_id text
    CHECK (source_conversation_id IS NULL OR length(source_conversation_id) <= 255),
  source_kind text NOT NULL DEFAULT 'call_analysis' CHECK (source_kind IN (
    'call_analysis', 'manual', 'import', 'regression_test'
  )),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  rationale text CHECK (rationale IS NULL OR length(rationale) <= 4000),
  proposed_payload jsonb NOT NULL CHECK (
    jsonb_typeof(proposed_payload) = 'object'
    AND octet_length(proposed_payload::text) <= 131072
  ),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review', 'approved', 'rejected', 'published', 'superseded'
  )),
  proposed_by_actor_id uuid,
  reviewed_by_actor_id uuid,
  reviewed_at timestamptz,
  review_notes text CHECK (review_notes IS NULL OR length(review_notes) <= 2000),
  published_by_actor_id uuid,
  published_at timestamptz,
  published_resource_id uuid,
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_content_change_proposals_version_unique
    UNIQUE (provider_id, content_type, content_key, version_number),
  CONSTRAINT ai_content_change_proposals_idempotency_unique
    UNIQUE (provider_id, idempotency_key),
  CONSTRAINT ai_content_change_proposals_version_order_check
    CHECK (version_number > base_version_number)
);

COMMENT ON TABLE public.ai_content_change_proposals IS
  'Immutable content versions proposed by AI or staff. Human review may approve/reject; only a trusted publisher may publish an approved version.';

CREATE INDEX IF NOT EXISTS ai_content_change_proposals_review_queue_idx
  ON public.ai_content_change_proposals (provider_id, status, created_at);
CREATE INDEX IF NOT EXISTS ai_content_change_proposals_source_call_idx
  ON public.ai_content_change_proposals (source_call_id)
  WHERE source_call_id IS NOT NULL;

ALTER TABLE public.ai_content_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_content_change_proposals FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_content_change_proposals
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_content_change_proposals TO authenticated;
GRANT SELECT, INSERT ON TABLE public.ai_content_change_proposals TO service_role;

DROP POLICY IF EXISTS phase_e_ai_content_change_proposals_tenant_read
  ON public.ai_content_change_proposals;
CREATE POLICY phase_e_ai_content_change_proposals_tenant_read
  ON public.ai_content_change_proposals FOR SELECT TO authenticated
  USING (public.phase_c_can_access_provider(provider_id));

CREATE OR REPLACE FUNCTION public.phase_e_guard_ai_content_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ai_content_proposal_history_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'pending_review'
       OR NEW.reviewed_by_actor_id IS NOT NULL
       OR NEW.reviewed_at IS NOT NULL
       OR NEW.published_by_actor_id IS NOT NULL
       OR NEW.published_at IS NOT NULL
       OR NEW.published_resource_id IS NOT NULL THEN
      RAISE EXCEPTION 'ai_content_proposal_must_start_pending_review'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.voice_config_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.voice_agent_configs AS config
      WHERE config.id = NEW.voice_config_id
        AND config.provider_id = NEW.provider_id
    ) THEN
      RAISE EXCEPTION 'ai_content_proposal_config_provider_mismatch'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.source_call_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.voice_calls AS call
      WHERE call.id = NEW.source_call_id
        AND call.provider_id = NEW.provider_id
    ) THEN
      RAISE EXCEPTION 'ai_content_proposal_call_provider_mismatch'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.voice_config_id IS DISTINCT FROM OLD.voice_config_id
     OR NEW.content_key IS DISTINCT FROM OLD.content_key
     OR NEW.content_type IS DISTINCT FROM OLD.content_type
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.base_version_number IS DISTINCT FROM OLD.base_version_number
     OR NEW.target_resource_id IS DISTINCT FROM OLD.target_resource_id
     OR NEW.source_call_id IS DISTINCT FROM OLD.source_call_id
     OR NEW.source_conversation_id IS DISTINCT FROM OLD.source_conversation_id
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.rationale IS DISTINCT FROM OLD.rationale
     OR NEW.proposed_payload IS DISTINCT FROM OLD.proposed_payload
     OR NEW.proposed_by_actor_id IS DISTINCT FROM OLD.proposed_by_actor_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ai_content_proposal_version_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'pending_review' AND (
    NEW.reviewed_by_actor_id IS DISTINCT FROM OLD.reviewed_by_actor_id
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
  ) THEN
    RAISE EXCEPTION 'ai_content_proposal_review_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'published' AND (
    NEW.published_by_actor_id IS DISTINCT FROM OLD.published_by_actor_id
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NEW.published_resource_id IS DISTINCT FROM OLD.published_resource_id
  ) THEN
    RAISE EXCEPTION 'ai_content_proposal_publication_is_immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'pending_review' AND NEW.status IN ('approved', 'rejected') THEN
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR auth.uid() IS NULL
       OR NEW.reviewed_by_actor_id IS DISTINCT FROM auth.uid()
       OR NEW.reviewed_at IS NULL
       OR NEW.published_by_actor_id IS NOT NULL
       OR NEW.published_at IS NOT NULL
       OR NEW.published_resource_id IS NOT NULL THEN
      RAISE EXCEPTION 'ai_content_proposal_requires_human_review'
        USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status = 'approved' AND NEW.status = 'published' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       OR OLD.reviewed_by_actor_id IS NULL
       OR OLD.reviewed_at IS NULL
       OR NEW.reviewed_by_actor_id IS DISTINCT FROM OLD.reviewed_by_actor_id
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
       OR NEW.published_by_actor_id IS NULL
       OR NEW.published_at IS NULL
       OR NEW.published_resource_id IS NULL THEN
      RAISE EXCEPTION 'ai_content_publication_requires_approved_server_command'
        USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status IN ('approved', 'published') AND NEW.status = 'superseded' THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       OR (
         OLD.status = 'approved'
         AND (
           NEW.published_by_actor_id IS NOT NULL
           OR NEW.published_at IS NOT NULL
           OR NEW.published_resource_id IS NOT NULL
         )
       ) THEN
      RAISE EXCEPTION 'ai_content_supersede_requires_server_command'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_ai_content_proposal_transition' USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_guard_ai_content_proposal()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_e_guard_ai_content_proposal
  ON public.ai_content_change_proposals;
CREATE TRIGGER phase_e_guard_ai_content_proposal
  BEFORE INSERT OR UPDATE OR DELETE ON public.ai_content_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.phase_e_guard_ai_content_proposal();

-- Human reviewers can approve or reject, but can never publish. The function
-- fixes actor/provider from the verified JWT and serializes concurrent reviews.
CREATE OR REPLACE FUNCTION public.phase_e_review_ai_content_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_review_notes text,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_provider_id uuid;
  v_tenant_id uuid;
  v_content_type text;
  v_version_number integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF p_proposal_id IS NULL OR p_correlation_id IS NULL
     OR p_decision NOT IN ('approved', 'rejected')
     OR length(coalesce(p_review_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'invalid_review_request' USING ERRCODE = '22023';
  END IF;

  SELECT proposal.provider_id, proposal.content_type, proposal.version_number
    INTO v_provider_id, v_content_type, v_version_number
  FROM public.ai_content_change_proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.status = 'pending_review'
  FOR UPDATE OF proposal;

  IF NOT FOUND OR NOT public.phase_c_can_manage_provider(v_provider_id) THEN
    RAISE EXCEPTION 'proposal_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT provider.company_id INTO v_tenant_id
  FROM public.service_providers AS provider
  WHERE provider.id = v_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_provider_not_available' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_content_change_proposals
  SET status = p_decision,
      reviewed_by_actor_id = v_actor_id,
      reviewed_at = statement_timestamp(),
      review_notes = nullif(trim(p_review_notes), '')
  WHERE id = p_proposal_id;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    v_actor_id, v_tenant_id, 'ai.content_proposal.review',
    'ai_content_change_proposal', p_proposal_id::text,
    'succeeded', p_correlation_id,
    pg_catalog.jsonb_build_object(
      'decision', p_decision,
      'content_type', v_content_type,
      'version_number', v_version_number
    )
  );

  RETURN p_proposal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_review_ai_content_proposal(uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_review_ai_content_proposal(uuid,text,text,uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audited publication of approved, tenant-bound content
-- ---------------------------------------------------------------------------

-- This helper deliberately accepts an actor id only from a service-role RPC.
-- It mirrors the Phase C provider-manager boundary without trusting an actor
-- supplied by a browser or by model output.
CREATE OR REPLACE FUNCTION public.phase_e_actor_can_manage_provider(
  p_actor_id uuid,
  p_provider_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.role() = 'service_role'
     AND p_actor_id IS NOT NULL
     AND p_provider_id IS NOT NULL
     AND (
       public.has_role(p_actor_id, 'admin'::public.app_role)
       OR EXISTS (
         SELECT 1
         FROM public.service_providers AS provider
         WHERE provider.id = p_provider_id
           AND provider.status IS DISTINCT FROM 'suspended'
           AND (
             provider.company_id IS NULL
             OR EXISTS (
               SELECT 1
               FROM public.companies AS active_company
               WHERE active_company.id = provider.company_id
                 AND active_company.status = 'active'
             )
           )
           AND (
             provider.user_id = p_actor_id
             OR EXISTS (
               SELECT 1
               FROM public.companies AS owned_company
               WHERE owned_company.id = provider.company_id
                 AND owned_company.status = 'active'
                 AND owned_company.owner_user_id = p_actor_id
             )
             OR EXISTS (
               SELECT 1
               FROM public.service_employees AS employee
               WHERE employee.provider_id = provider.id
                 AND employee.user_id = p_actor_id
                 AND employee.is_active = true
                 AND employee.role IN ('owner', 'manager')
             )
             OR EXISTS (
               SELECT 1
               FROM public.workshop_employees AS employee
               WHERE employee.provider_id = provider.id
                 AND employee.user_id = p_actor_id
                 AND employee.status = 'active'
                 AND employee.role IN ('owner', 'manager')
             )
           )
       )
     )
$$;

REVOKE ALL ON FUNCTION public.phase_e_actor_can_manage_provider(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.phase_e_set_voice_agent_runtime_controls(
  p_voice_config_id uuid,
  p_actor_id uuid,
  p_kill_switch_enabled boolean,
  p_dry_run_tools boolean,
  p_max_concurrent_calls integer,
  p_max_tool_calls_per_conversation integer,
  p_max_write_tool_calls_per_conversation integer,
  p_daily_tool_call_limit integer,
  p_conversation_cost_limit_microusd bigint,
  p_daily_cost_limit_microusd bigint,
  p_is_active boolean,
  p_outbound_enabled boolean,
  p_calendar_access boolean,
  p_orders_access boolean,
  p_privacy_confirmed boolean,
  p_reason text,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config public.voice_agent_configs%ROWTYPE;
  v_tenant_id uuid;
  v_updated_rows integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_voice_config_id IS NULL OR p_actor_id IS NULL
     OR p_correlation_id IS NULL
     OR p_kill_switch_enabled IS NULL OR p_dry_run_tools IS NULL
     OR p_is_active IS NULL OR p_outbound_enabled IS NULL
     OR p_calendar_access IS NULL OR p_orders_access IS NULL
     OR p_privacy_confirmed IS NULL
     OR p_max_concurrent_calls IS NULL
     OR p_max_tool_calls_per_conversation IS NULL
     OR p_max_write_tool_calls_per_conversation IS NULL
     OR p_daily_tool_call_limit IS NULL
     OR p_conversation_cost_limit_microusd IS NULL
     OR p_daily_cost_limit_microusd IS NULL
     OR p_max_concurrent_calls NOT BETWEEN 0 AND 1000
     OR p_max_tool_calls_per_conversation NOT BETWEEN 0 AND 100
     OR p_max_write_tool_calls_per_conversation NOT BETWEEN 0 AND 25
     OR p_max_write_tool_calls_per_conversation
       > p_max_tool_calls_per_conversation
     OR p_daily_tool_call_limit NOT BETWEEN 0 AND 1000000
     OR p_conversation_cost_limit_microusd NOT BETWEEN 0 AND 1000000000000
     OR p_daily_cost_limit_microusd NOT BETWEEN 0 AND 1000000000000
     OR length(pg_catalog.btrim(coalesce(p_reason, ''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'invalid_voice_agent_runtime_change' USING ERRCODE = '22023';
  END IF;

  IF p_is_active AND NOT p_privacy_confirmed THEN
    RAISE EXCEPTION 'voice_agent_activation_requires_privacy_confirmation'
      USING ERRCODE = '42501';
  END IF;
  IF NOT p_kill_switch_enabled AND (
    NOT p_is_active
    OR NOT p_privacy_confirmed
    OR p_max_concurrent_calls <= 0
    OR (
      NOT p_dry_run_tools
      AND (
        p_max_tool_calls_per_conversation <= 0
        OR p_daily_tool_call_limit <= 0
        OR p_conversation_cost_limit_microusd <= 0
        OR p_daily_cost_limit_microusd <= 0
      )
    )
  ) THEN
    RAISE EXCEPTION 'voice_agent_runtime_release_is_not_safe'
      USING ERRCODE = '42501';
  END IF;

  SELECT config.* INTO v_config
  FROM public.voice_agent_configs AS config
  WHERE config.id = p_voice_config_id
  FOR UPDATE OF config;
  IF NOT FOUND OR NOT public.phase_e_actor_can_manage_provider(
    p_actor_id, v_config.provider_id
  ) THEN
    RAISE EXCEPTION 'voice_agent_runtime_config_not_available'
      USING ERRCODE = '42501';
  END IF;

  SELECT provider.company_id INTO v_tenant_id
  FROM public.service_providers AS provider
  WHERE provider.id = v_config.provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'voice_agent_provider_not_available' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'rido.phase_e_runtime_authorization', p_voice_config_id::text, true
  );
  UPDATE public.voice_agent_configs
  SET kill_switch_enabled = p_kill_switch_enabled,
      dry_run_tools = p_dry_run_tools,
      max_concurrent_calls = p_max_concurrent_calls,
      max_tool_calls_per_conversation = p_max_tool_calls_per_conversation,
      max_write_tool_calls_per_conversation =
        p_max_write_tool_calls_per_conversation,
      daily_tool_call_limit = p_daily_tool_call_limit,
      conversation_cost_limit_microusd = p_conversation_cost_limit_microusd,
      daily_cost_limit_microusd = p_daily_cost_limit_microusd,
      is_active = p_is_active,
      outbound_enabled = p_outbound_enabled,
      calendar_access = p_calendar_access,
      orders_access = p_orders_access,
      privacy_confirmed = p_privacy_confirmed,
      privacy_confirmed_at = CASE
        WHEN p_privacy_confirmed AND NOT v_config.privacy_confirmed
          THEN statement_timestamp()
        WHEN NOT p_privacy_confirmed THEN NULL
        ELSE v_config.privacy_confirmed_at
      END,
      updated_at = statement_timestamp()
  WHERE id = p_voice_config_id
    AND provider_id = v_config.provider_id;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  PERFORM pg_catalog.set_config(
    'rido.phase_e_runtime_authorization', '', true
  );

  IF v_updated_rows <> 1 THEN
    RAISE EXCEPTION 'voice_agent_runtime_config_changed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, v_tenant_id, 'ai.voice_agent_runtime.change',
    'voice_agent_config', p_voice_config_id::text,
    'succeeded', p_correlation_id,
    pg_catalog.jsonb_build_object(
      'provider_id', v_config.provider_id,
      'reason', pg_catalog.btrim(p_reason),
      'previous_kill_switch_enabled', v_config.kill_switch_enabled,
      'kill_switch_enabled', p_kill_switch_enabled,
      'dry_run_tools', p_dry_run_tools,
      'max_concurrent_calls', p_max_concurrent_calls,
      'max_tool_calls_per_conversation', p_max_tool_calls_per_conversation,
      'max_write_tool_calls_per_conversation',
        p_max_write_tool_calls_per_conversation,
      'daily_tool_call_limit', p_daily_tool_call_limit,
      'conversation_cost_limit_microusd',
        p_conversation_cost_limit_microusd,
      'daily_cost_limit_microusd', p_daily_cost_limit_microusd,
      'is_active', p_is_active,
      'outbound_enabled', p_outbound_enabled,
      'calendar_access', p_calendar_access,
      'orders_access', p_orders_access,
      'privacy_confirmed', p_privacy_confirmed
    )
  );

  RETURN p_voice_config_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_set_voice_agent_runtime_controls(
  uuid,uuid,boolean,boolean,integer,integer,integer,integer,bigint,bigint,
  boolean,boolean,boolean,boolean,boolean,text,uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_set_voice_agent_runtime_controls(
  uuid,uuid,boolean,boolean,integer,integer,integer,integer,bigint,bigint,
  boolean,boolean,boolean,boolean,boolean,text,uuid
) TO service_role;

CREATE TABLE IF NOT EXISTS public.ai_published_content_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  provider_id uuid NOT NULL,
  voice_config_id uuid,
  proposal_id uuid NOT NULL UNIQUE,
  content_key uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('knowledge', 'script')),
  version_number integer NOT NULL CHECK (version_number > 0),
  content_payload jsonb NOT NULL CHECK (
    jsonb_typeof(content_payload) = 'object'
    AND octet_length(content_payload::text) <= 131072
  ),
  published_by_actor_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_published_content_versions_version_unique
    UNIQUE (provider_id, content_type, content_key, version_number)
);

COMMENT ON TABLE public.ai_published_content_versions IS
  'Immutable canonical runtime versions. Rows can be created only by the audited Phase E publisher after human approval.';

CREATE INDEX IF NOT EXISTS ai_published_content_versions_lookup_idx
  ON public.ai_published_content_versions (
    provider_id, voice_config_id, content_type, content_key, version_number DESC
  );

ALTER TABLE public.ai_published_content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_published_content_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ai_published_content_versions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.ai_published_content_versions TO authenticated;
GRANT SELECT ON TABLE public.ai_published_content_versions TO service_role;

DROP POLICY IF EXISTS phase_e_ai_published_content_versions_tenant_read
  ON public.ai_published_content_versions;
CREATE POLICY phase_e_ai_published_content_versions_tenant_read
  ON public.ai_published_content_versions FOR SELECT TO authenticated
  USING (public.phase_c_can_access_provider(provider_id));

CREATE OR REPLACE FUNCTION public.phase_e_guard_published_content_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ai_published_content_is_immutable' USING ERRCODE = '42501';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' OR NOT EXISTS (
    SELECT 1
    FROM public.ai_content_change_proposals AS proposal
    WHERE proposal.id = NEW.proposal_id
      AND proposal.status = 'approved'
      AND proposal.provider_id = NEW.provider_id
      AND proposal.voice_config_id IS NOT DISTINCT FROM NEW.voice_config_id
      AND proposal.content_key = NEW.content_key
      AND proposal.content_type = NEW.content_type
      AND proposal.version_number = NEW.version_number
      AND proposal.proposed_payload = NEW.content_payload
      AND proposal.reviewed_by_actor_id IS NOT NULL
      AND proposal.reviewed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ai_content_publication_requires_matching_approved_proposal'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_guard_published_content_version()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS phase_e_guard_published_content_version
  ON public.ai_published_content_versions;
CREATE TRIGGER phase_e_guard_published_content_version
  BEFORE INSERT OR UPDATE OR DELETE ON public.ai_published_content_versions
  FOR EACH ROW EXECUTE FUNCTION public.phase_e_guard_published_content_version();

CREATE OR REPLACE FUNCTION public.phase_e_publish_ai_content_proposal(
  p_proposal_id uuid,
  p_publisher_actor_id uuid,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_proposal public.ai_content_change_proposals%ROWTYPE;
  v_published_resource_id uuid := extensions.gen_random_uuid();
  v_tenant_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_proposal_id IS NULL OR p_publisher_actor_id IS NULL
     OR p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'invalid_ai_content_publish_request' USING ERRCODE = '22023';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.ai_content_change_proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.status IN ('approved', 'published')
  FOR UPDATE OF proposal;

  IF NOT FOUND
     OR NOT public.phase_e_actor_can_manage_provider(
       p_publisher_actor_id, v_proposal.provider_id
     ) THEN
    RAISE EXCEPTION 'approved_proposal_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT provider.company_id INTO v_tenant_id
  FROM public.service_providers AS provider
  WHERE provider.id = v_proposal.provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal_provider_not_available' USING ERRCODE = '42501';
  END IF;

  IF v_proposal.status = 'published' THEN
    IF v_proposal.published_resource_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.ai_published_content_versions AS published
      WHERE published.id = v_proposal.published_resource_id
        AND published.proposal_id = v_proposal.id
        AND published.provider_id = v_proposal.provider_id
    ) THEN
      RAISE EXCEPTION 'published_proposal_is_inconsistent' USING ERRCODE = '23514';
    END IF;
    RETURN v_proposal.published_resource_id;
  END IF;

  IF v_proposal.reviewed_by_actor_id IS NULL OR v_proposal.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'human_approval_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_published_content_versions (
    id, provider_id, voice_config_id, proposal_id, content_key,
    content_type, version_number, content_payload,
    published_by_actor_id, correlation_id, published_at
  ) VALUES (
    v_published_resource_id, v_proposal.provider_id,
    v_proposal.voice_config_id, v_proposal.id, v_proposal.content_key,
    v_proposal.content_type, v_proposal.version_number,
    v_proposal.proposed_payload, p_publisher_actor_id,
    p_correlation_id, statement_timestamp()
  );

  UPDATE public.ai_content_change_proposals
  SET status = 'published',
      published_by_actor_id = p_publisher_actor_id,
      published_at = statement_timestamp(),
      published_resource_id = v_published_resource_id
  WHERE id = v_proposal.id
    AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approved_proposal_changed_during_publish'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_publisher_actor_id, v_tenant_id, 'ai.content_proposal.publish',
    'ai_published_content_version', v_published_resource_id::text,
    'succeeded', p_correlation_id,
    pg_catalog.jsonb_build_object(
      'proposal_id', v_proposal.id,
      'provider_id', v_proposal.provider_id,
      'content_type', v_proposal.content_type,
      'version_number', v_proposal.version_number
    )
  );

  RETURN v_published_resource_id;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_publish_ai_content_proposal(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_publish_ai_content_proposal(uuid,uuid,uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Transactional, idempotent call-analysis persistence
-- ---------------------------------------------------------------------------

-- The function below is added after the proposal queue because it writes
-- pending proposals in the same transaction as call, transcript and outcome.
-- No external API call is performed by SQL.
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS analysis_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS analysis_correlation_id uuid,
  ADD COLUMN IF NOT EXISTS analysis_request_fingerprint text;

DO $phase_e_voice_call_analysis_fingerprint_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'voice_calls_analysis_request_fingerprint_phase_e_check'
      AND conrelid = 'public.voice_calls'::regclass
  ) THEN
    ALTER TABLE public.voice_calls
      ADD CONSTRAINT voice_calls_analysis_request_fingerprint_phase_e_check
      CHECK (
        analysis_request_fingerprint IS NULL
        OR analysis_request_fingerprint ~ '^[0-9a-f]{64}$'
      );
  END IF;
END;
$phase_e_voice_call_analysis_fingerprint_constraint$;

-- Multiple rows without an ElevenLabs id remain valid. Non-empty ids are
-- normalized before uniqueness, so whitespace cannot bypass replay protection.
-- Deployment preflight: group existing non-empty ids by provider and trimmed
-- value. If duplicates exist, this index intentionally fails; reconcile those
-- rows manually (call/transcript/outcome/proposals) instead of deleting data.
CREATE UNIQUE INDEX IF NOT EXISTS
  voice_calls_provider_elevenlabs_conversation_phase_e_uidx
  ON public.voice_calls (
    provider_id,
    (NULLIF(pg_catalog.btrim(elevenlabs_conversation_id), ''))
  )
  WHERE NULLIF(pg_catalog.btrim(elevenlabs_conversation_id), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  voice_calls_provider_analysis_idempotency_phase_e_uidx
  ON public.voice_calls (provider_id, analysis_idempotency_key)
  WHERE analysis_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.phase_e_record_voice_call_analysis(
  p_provider_id uuid,
  p_voice_config_id uuid,
  p_idempotency_key uuid,
  p_correlation_id uuid,
  p_analysis jsonb
)
RETURNS TABLE(
  call_id uuid,
  duplicate boolean,
  proposals_created integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_config public.voice_agent_configs%ROWTYPE;
  v_existing_call public.voice_calls%ROWTYPE;
  v_call_id uuid := extensions.gen_random_uuid();
  v_tenant_id uuid;
  v_transcript jsonb := coalesce(p_analysis -> 'transcript', '[]'::jsonb);
  v_objections jsonb := coalesce(p_analysis -> 'objections', '[]'::jsonb);
  v_winning_phrases jsonb := coalesce(p_analysis -> 'winning_phrases', '[]'::jsonb);
  v_losing_signals jsonb := coalesce(p_analysis -> 'losing_signals', '[]'::jsonb);
  v_key_topics jsonb := coalesce(p_analysis -> 'key_topics', '[]'::jsonb);
  v_customer_data jsonb := coalesce(p_analysis -> 'customer_data', '{}'::jsonb);
  v_lessons jsonb := coalesce(p_analysis -> 'lessons', '[]'::jsonb);
  v_conversation_id text;
  v_external_call_sid text;
  v_persona_key text;
  v_direction text;
  v_summary text;
  v_outcome text;
  v_outcome_confidence numeric := 0;
  v_next_step text;
  v_analysis_model text;
  v_contact_name text;
  v_linked_entity_type text;
  v_linked_entity_id uuid;
  v_linked_entity_id_text text;
  v_full_text text;
  v_request_fingerprint text;
  v_proposal_count integer := 0;
  v_existing_proposals integer;
  v_lesson record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_provider_id IS NULL OR p_voice_config_id IS NULL
     OR p_idempotency_key IS NULL OR p_correlation_id IS NULL
     OR p_analysis IS NULL OR jsonb_typeof(p_analysis) <> 'object'
     OR octet_length(p_analysis::text) > 524288 THEN
    RAISE EXCEPTION 'invalid_voice_call_analysis_request' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_analysis) AS supplied_key(key_name)
    WHERE supplied_key.key_name <> ALL (ARRAY[
      'elevenlabs_conversation_id', 'external_call_sid', 'persona_key',
      'direction', 'transcript', 'full_text', 'summary', 'outcome',
      'outcome_confidence', 'objections', 'winning_phrases',
      'losing_signals', 'key_topics', 'next_step', 'customer_data',
      'analysis_model', 'lessons', 'contact_name', 'linked_entity_type',
      'linked_entity_id'
    ]::text[])
  ) THEN
    RAISE EXCEPTION 'voice_call_analysis_contains_unknown_field'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_analysis ? 'elevenlabs_conversation_id')
     OR jsonb_typeof(p_analysis -> 'elevenlabs_conversation_id') <> 'string'
     OR NOT (p_analysis ? 'persona_key')
     OR jsonb_typeof(p_analysis -> 'persona_key') <> 'string'
     OR NOT (p_analysis ? 'direction')
     OR jsonb_typeof(p_analysis -> 'direction') <> 'string'
     OR NOT (p_analysis ? 'transcript')
     OR jsonb_typeof(p_analysis -> 'transcript') <> 'array'
     OR NOT (p_analysis ? 'outcome')
     OR jsonb_typeof(p_analysis -> 'outcome') <> 'string'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_analysis) AS scalar_field(key_name, value)
       WHERE scalar_field.key_name = ANY (ARRAY[
         'external_call_sid', 'full_text', 'summary', 'next_step',
         'analysis_model', 'contact_name', 'linked_entity_type',
         'linked_entity_id'
       ]::text[])
         AND jsonb_typeof(scalar_field.value) NOT IN ('string', 'null')
     ) THEN
    RAISE EXCEPTION 'invalid_voice_call_analysis_field_types'
      USING ERRCODE = '22023';
  END IF;

  v_conversation_id := nullif(pg_catalog.btrim(p_analysis ->> 'elevenlabs_conversation_id'), '');
  v_external_call_sid := nullif(pg_catalog.btrim(p_analysis ->> 'external_call_sid'), '');
  v_persona_key := nullif(pg_catalog.btrim(p_analysis ->> 'persona_key'), '');
  v_direction := p_analysis ->> 'direction';
  v_summary := nullif(pg_catalog.btrim(p_analysis ->> 'summary'), '');
  v_outcome := p_analysis ->> 'outcome';
  v_next_step := nullif(pg_catalog.btrim(p_analysis ->> 'next_step'), '');
  v_analysis_model := nullif(pg_catalog.btrim(p_analysis ->> 'analysis_model'), '');
  v_contact_name := nullif(pg_catalog.btrim(p_analysis ->> 'contact_name'), '');
  v_linked_entity_type := nullif(pg_catalog.btrim(p_analysis ->> 'linked_entity_type'), '');
  v_linked_entity_id_text := nullif(pg_catalog.btrim(p_analysis ->> 'linked_entity_id'), '');

  IF v_conversation_id IS NULL
     OR v_conversation_id !~ '^[A-Za-z0-9._:-]{1,255}$'
     OR v_persona_key IS NULL
     OR v_persona_key !~ '^[A-Za-z0-9_-]{1,64}$'
     OR v_direction NOT IN ('inbound', 'outbound')
     OR v_outcome NOT IN (
       'booked', 'sold', 'refused', 'callback', 'no_interest',
       'info_only', 'voicemail', 'wrong_number', 'other'
     )
     OR (v_external_call_sid IS NOT NULL
       AND v_external_call_sid !~ '^[A-Za-z0-9._:-]{1,255}$')
     OR length(coalesce(v_summary, '')) > 3000
     OR length(coalesce(v_next_step, '')) > 1000
     OR length(coalesce(v_analysis_model, '')) > 120
     OR length(coalesce(v_contact_name, '')) > 200 THEN
    RAISE EXCEPTION 'invalid_voice_call_analysis_identity'
      USING ERRCODE = '22023';
  END IF;

  IF p_analysis ? 'outcome_confidence' THEN
    IF jsonb_typeof(p_analysis -> 'outcome_confidence') <> 'number'
       OR (p_analysis ->> 'outcome_confidence')::numeric NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION 'invalid_voice_call_outcome_confidence'
        USING ERRCODE = '22023';
    END IF;
    v_outcome_confidence := (p_analysis ->> 'outcome_confidence')::numeric;
  END IF;

  IF jsonb_typeof(v_transcript) <> 'array'
     OR jsonb_array_length(v_transcript) NOT BETWEEN 2 AND 100
     OR octet_length(v_transcript::text) > 200000
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_transcript) AS transcript_item(item)
       WHERE jsonb_typeof(transcript_item.item) <> 'object'
          OR jsonb_typeof(transcript_item.item -> 'role') <> 'string'
          OR jsonb_typeof(transcript_item.item -> 'content') <> 'string'
          OR transcript_item.item ->> 'role' NOT IN ('user', 'assistant')
          OR length(pg_catalog.btrim(coalesce(transcript_item.item ->> 'content', '')))
            NOT BETWEEN 1 AND 4000
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(transcript_item.item) AS item_key(key_name)
            WHERE item_key.key_name <> ALL (ARRAY['role', 'content']::text[])
          )
     ) THEN
    RAISE EXCEPTION 'invalid_voice_call_transcript' USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(
    CASE WHEN transcript_item.item ->> 'role' = 'assistant'
      THEN 'AGENT: ' ELSE 'KLIENT: ' END
      || pg_catalog.btrim(transcript_item.item ->> 'content'),
    E'\n' ORDER BY transcript_item.ordinality
  ) INTO v_full_text
  FROM jsonb_array_elements(v_transcript) WITH ORDINALITY
    AS transcript_item(item, ordinality);

  IF p_analysis ? 'full_text'
     AND nullif(p_analysis ->> 'full_text', '') IS NOT NULL
     AND (p_analysis ->> 'full_text') IS DISTINCT FROM v_full_text THEN
    RAISE EXCEPTION 'voice_call_full_text_mismatch' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_objections) <> 'array'
     OR jsonb_array_length(v_objections) > 12
     OR octet_length(v_objections::text) > 32768
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_objections) AS objection(item)
       WHERE jsonb_typeof(objection.item) <> 'object'
          OR (
            objection.item ? 'type'
            AND jsonb_typeof(objection.item -> 'type') <> 'string'
          )
          OR (
            objection.item ? 'customer_quote'
            AND jsonb_typeof(objection.item -> 'customer_quote') <> 'string'
          )
          OR (
            objection.item ? 'agent_response'
            AND jsonb_typeof(objection.item -> 'agent_response') <> 'string'
          )
          OR length(coalesce(objection.item ->> 'type', '')) > 100
          OR length(coalesce(objection.item ->> 'customer_quote', '')) > 500
          OR length(coalesce(objection.item ->> 'agent_response', '')) > 500
          OR (
            objection.item ? 'resolved'
            AND jsonb_typeof(objection.item -> 'resolved') <> 'boolean'
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(objection.item) AS item_key(key_name)
            WHERE item_key.key_name <> ALL (ARRAY[
              'type', 'customer_quote', 'agent_response', 'resolved'
            ]::text[])
          )
     ) THEN
    RAISE EXCEPTION 'invalid_voice_call_objections' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_winning_phrases) <> 'array'
     OR jsonb_array_length(v_winning_phrases) > 12
     OR octet_length(v_winning_phrases::text) > 16384
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_winning_phrases) AS phrase(item)
       WHERE jsonb_typeof(phrase.item) <> 'string'
          OR length(phrase.item #>> '{}') NOT BETWEEN 1 AND 500
     )
     OR jsonb_typeof(v_losing_signals) <> 'array'
     OR jsonb_array_length(v_losing_signals) > 12
     OR octet_length(v_losing_signals::text) > 16384
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_losing_signals) AS signal(item)
       WHERE jsonb_typeof(signal.item) <> 'string'
          OR length(signal.item #>> '{}') NOT BETWEEN 1 AND 800
     )
     OR jsonb_typeof(v_key_topics) <> 'array'
     OR jsonb_array_length(v_key_topics) > 20
     OR octet_length(v_key_topics::text) > 8192
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_key_topics) AS topic(item)
       WHERE jsonb_typeof(topic.item) <> 'string'
          OR length(topic.item #>> '{}') NOT BETWEEN 1 AND 120
     ) THEN
    RAISE EXCEPTION 'invalid_voice_call_analysis_arrays' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_customer_data) <> 'object'
     OR octet_length(v_customer_data::text) > 8192
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_customer_data) AS customer_key(key_name)
       WHERE customer_key.key_name <> ALL (
         ARRAY['name', 'phone', 'vehicle', 'service']::text[]
       )
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(v_customer_data) AS customer_value(key_name, value)
       WHERE jsonb_typeof(customer_value.value) <> 'string'
          OR length(customer_value.value #>> '{}') > CASE customer_value.key_name
            WHEN 'phone' THEN 50
            WHEN 'name' THEN 200
            WHEN 'vehicle' THEN 300
            ELSE 500
          END
     ) THEN
    RAISE EXCEPTION 'invalid_voice_call_customer_data' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_lessons) <> 'array'
     OR jsonb_array_length(v_lessons) > 8
     OR octet_length(v_lessons::text) > 65536
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_lessons) AS lesson(item)
       WHERE jsonb_typeof(lesson.item) <> 'object'
          OR jsonb_typeof(lesson.item -> 'situation') <> 'string'
          OR jsonb_typeof(lesson.item -> 'recommended_response') <> 'string'
          OR (
            lesson.item ? 'title'
            AND jsonb_typeof(lesson.item -> 'title') <> 'string'
          )
          OR (
            lesson.item ? 'rationale'
            AND jsonb_typeof(lesson.item -> 'rationale') <> 'string'
          )
          OR (
            lesson.item ? 'category'
            AND jsonb_typeof(lesson.item -> 'category') <> 'string'
          )
          OR (
            lesson.item ? 'language'
            AND jsonb_typeof(lesson.item -> 'language') <> 'string'
          )
          OR length(pg_catalog.btrim(coalesce(lesson.item ->> 'situation', '')))
            NOT BETWEEN 1 AND 800
          OR length(pg_catalog.btrim(coalesce(lesson.item ->> 'recommended_response', '')))
            NOT BETWEEN 1 AND 1200
          OR length(coalesce(lesson.item ->> 'title', '')) > 240
          OR length(coalesce(lesson.item ->> 'rationale', '')) > 800
          OR coalesce(lesson.item ->> 'category', 'other') NOT IN (
            'opening', 'qualifying', 'objection_handling', 'closing',
            'scheduling', 'style', 'follow_up', 'other'
          )
          OR coalesce(lesson.item ->> 'language', 'pl') !~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})?$'
          OR (
            lesson.item ? 'confidence'
            AND (
              jsonb_typeof(lesson.item -> 'confidence') <> 'number'
              OR (lesson.item ->> 'confidence')::numeric NOT BETWEEN 0 AND 1
            )
          )
          OR (
            lesson.item ? 'trigger_phrases'
            AND (
              jsonb_typeof(lesson.item -> 'trigger_phrases') <> 'array'
              OR jsonb_array_length(lesson.item -> 'trigger_phrases') > 20
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements(lesson.item -> 'trigger_phrases')
                  AS trigger_phrase(item)
                WHERE jsonb_typeof(trigger_phrase.item) <> 'string'
                   OR length(trigger_phrase.item #>> '{}') NOT BETWEEN 1 AND 200
              )
            )
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(lesson.item) AS item_key(key_name)
            WHERE item_key.key_name <> ALL (ARRAY[
              'title', 'rationale', 'category', 'situation',
              'trigger_phrases', 'recommended_response', 'language',
              'confidence'
            ]::text[])
          )
     ) THEN
    RAISE EXCEPTION 'invalid_voice_call_lessons' USING ERRCODE = '22023';
  END IF;

  IF (v_linked_entity_type IS NULL) IS DISTINCT FROM
       (v_linked_entity_id_text IS NULL)
     OR (v_linked_entity_type IS NOT NULL
       AND v_linked_entity_type NOT IN ('workshop_order', 'service_booking'))
     OR (v_linked_entity_id_text IS NOT NULL
       AND v_linked_entity_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'invalid_voice_call_linked_entity' USING ERRCODE = '22023';
  END IF;
  IF v_linked_entity_id_text IS NOT NULL THEN
    v_linked_entity_id := v_linked_entity_id_text::uuid;
  END IF;

  SELECT config.* INTO v_config
  FROM public.voice_agent_configs AS config
  WHERE config.id = p_voice_config_id
    AND config.provider_id = p_provider_id
  FOR SHARE OF config;
  IF NOT FOUND OR v_config.persona_key IS DISTINCT FROM v_persona_key THEN
    RAISE EXCEPTION 'voice_call_config_provider_persona_mismatch'
      USING ERRCODE = '42501';
  END IF;
  IF v_config.kill_switch_enabled
     OR NOT v_config.is_active
     OR NOT v_config.privacy_confirmed
     OR NOT EXISTS (
       SELECT 1
       FROM public.ai_global_runtime_control AS global_control
       WHERE global_control.control_key = 'global'
         AND global_control.kill_switch_enabled = false
     ) THEN
    RAISE EXCEPTION 'voice_call_analysis_persistence_is_disabled'
      USING ERRCODE = '42501';
  END IF;

  SELECT provider.company_id INTO v_tenant_id
  FROM public.service_providers AS provider
  WHERE provider.id = p_provider_id
    AND provider.status IS DISTINCT FROM 'suspended';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'voice_call_provider_not_available' USING ERRCODE = '42501';
  END IF;

  IF v_linked_entity_type = 'workshop_order' AND NOT EXISTS (
    SELECT 1
    FROM public.workshop_orders AS linked_order
    WHERE linked_order.id = v_linked_entity_id
      AND linked_order.provider_id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'voice_call_linked_entity_provider_mismatch'
      USING ERRCODE = '42501';
  ELSIF v_linked_entity_type = 'service_booking' AND NOT EXISTS (
    SELECT 1
    FROM public.service_bookings AS linked_booking
    WHERE linked_booking.id = v_linked_entity_id
      AND linked_booking.provider_id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'voice_call_linked_entity_provider_mismatch'
      USING ERRCODE = '42501';
  END IF;

  v_request_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_analysis::text, 'UTF8')),
    'hex'
  );

  -- Fixed lock order prevents concurrent duplicate webhook deliveries from
  -- creating either two calls or two proposal sets.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase-e-call-analysis-idempotency:' || p_provider_id::text
        || ':' || p_idempotency_key::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'phase-e-call-analysis-conversation:' || p_provider_id::text
        || ':' || v_conversation_id,
      0
    )
  );

  SELECT existing_call.* INTO v_existing_call
  FROM public.voice_calls AS existing_call
  WHERE existing_call.provider_id = p_provider_id
    AND existing_call.analysis_idempotency_key = p_idempotency_key
  FOR UPDATE OF existing_call;

  IF FOUND THEN
    IF v_existing_call.config_id IS DISTINCT FROM p_voice_config_id
       OR v_existing_call.persona_key IS DISTINCT FROM v_persona_key
       OR v_existing_call.direction IS DISTINCT FROM v_direction
       OR NULLIF(pg_catalog.btrim(v_existing_call.elevenlabs_conversation_id), '')
          IS DISTINCT FROM v_conversation_id
       OR v_existing_call.analysis_request_fingerprint
          IS DISTINCT FROM v_request_fingerprint THEN
      RAISE EXCEPTION 'voice_call_analysis_idempotency_payload_mismatch'
        USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.voice_transcripts AS transcript
      WHERE transcript.call_id = v_existing_call.id
        AND transcript.provider_id = p_provider_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.voice_call_outcomes AS call_outcome
      WHERE call_outcome.call_id = v_existing_call.id
        AND call_outcome.provider_id = p_provider_id
    ) THEN
      RAISE EXCEPTION 'voice_call_analysis_requires_manual_reconciliation'
        USING ERRCODE = '55000';
    END IF;

    SELECT count(*)::integer INTO v_existing_proposals
    FROM public.ai_content_change_proposals AS proposal
    WHERE proposal.provider_id = p_provider_id
      AND proposal.source_call_id = v_existing_call.id;
    RETURN QUERY SELECT v_existing_call.id, true, v_existing_proposals;
    RETURN;
  END IF;

  SELECT existing_call.* INTO v_existing_call
  FROM public.voice_calls AS existing_call
  WHERE existing_call.provider_id = p_provider_id
    AND NULLIF(pg_catalog.btrim(existing_call.elevenlabs_conversation_id), '')
      = v_conversation_id
  FOR UPDATE OF existing_call;

  IF FOUND THEN
    IF v_existing_call.config_id IS DISTINCT FROM p_voice_config_id
       OR v_existing_call.persona_key IS DISTINCT FROM v_persona_key
       OR v_existing_call.direction IS DISTINCT FROM v_direction THEN
      RAISE EXCEPTION 'voice_call_conversation_binding_mismatch'
        USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.voice_transcripts AS transcript
      WHERE transcript.call_id = v_existing_call.id
        AND transcript.provider_id = p_provider_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.voice_call_outcomes AS call_outcome
      WHERE call_outcome.call_id = v_existing_call.id
        AND call_outcome.provider_id = p_provider_id
    ) THEN
      RAISE EXCEPTION 'voice_call_analysis_requires_manual_reconciliation'
        USING ERRCODE = '55000';
    END IF;

    SELECT count(*)::integer INTO v_existing_proposals
    FROM public.ai_content_change_proposals AS proposal
    WHERE proposal.provider_id = p_provider_id
      AND proposal.source_call_id = v_existing_call.id;
    RETURN QUERY SELECT v_existing_call.id, true, v_existing_proposals;
    RETURN;
  END IF;

  INSERT INTO public.voice_calls (
    id, provider_id, config_id, persona_key, direction, twilio_call_sid,
    elevenlabs_conversation_id, contact_name, status, summary, outcome,
    linked_entity_type, linked_entity_id, analysis_idempotency_key,
    analysis_correlation_id, analysis_request_fingerprint
  ) VALUES (
    v_call_id, p_provider_id, p_voice_config_id, v_persona_key, v_direction,
    v_external_call_sid, v_conversation_id, v_contact_name, 'completed',
    v_summary, v_outcome, v_linked_entity_type, v_linked_entity_id,
    p_idempotency_key, p_correlation_id, v_request_fingerprint
  );

  INSERT INTO public.voice_transcripts (
    call_id, provider_id, turns, full_text, summary, summary_lang
  ) VALUES (
    v_call_id, p_provider_id, v_transcript, v_full_text, v_summary, 'pl'
  );

  INSERT INTO public.voice_call_outcomes (
    call_id, provider_id, persona_key, outcome, outcome_confidence,
    objections, winning_phrases, losing_signals, key_topics, next_step,
    customer_data, analysis_model, analyzed_at
  ) VALUES (
    v_call_id, p_provider_id, v_persona_key, v_outcome,
    v_outcome_confidence, v_objections, v_winning_phrases,
    v_losing_signals, ARRAY(
      SELECT jsonb_array_elements_text(v_key_topics)
    ), v_next_step, v_customer_data, v_analysis_model, statement_timestamp()
  );

  -- `learning_mode` controls whether valid lessons enter review. Even when
  -- enabled, every row starts pending_review and cannot become runtime content
  -- in this function.
  IF v_config.learning_mode = 'per_call' THEN
    FOR v_lesson IN
      SELECT lesson.item, lesson.ordinality
      FROM jsonb_array_elements(v_lessons) WITH ORDINALITY
        AS lesson(item, ordinality)
    LOOP
      INSERT INTO public.ai_content_change_proposals (
        provider_id, voice_config_id, content_key, content_type,
        version_number, base_version_number, source_call_id,
        source_conversation_id, source_kind, title, rationale,
        proposed_payload, status, proposed_by_actor_id, idempotency_key,
        correlation_id
      ) VALUES (
        p_provider_id, p_voice_config_id, extensions.gen_random_uuid(),
        'knowledge', 1, 0, v_call_id, v_conversation_id, 'call_analysis',
        left(coalesce(
          nullif(pg_catalog.btrim(v_lesson.item ->> 'title'), ''),
          'Propozycja po rozmowie: '
            || coalesce(v_lesson.item ->> 'category', 'other')
        ), 240),
        nullif(pg_catalog.btrim(v_lesson.item ->> 'rationale'), ''),
        pg_catalog.jsonb_build_object(
          'category', coalesce(v_lesson.item ->> 'category', 'other'),
          'situation', pg_catalog.btrim(v_lesson.item ->> 'situation'),
          'trigger_phrases', coalesce(
            v_lesson.item -> 'trigger_phrases', '[]'::jsonb
          ),
          'recommended_response', pg_catalog.btrim(
            v_lesson.item ->> 'recommended_response'
          ),
          'language', coalesce(v_lesson.item ->> 'language', 'pl'),
          'confidence', coalesce(v_lesson.item -> 'confidence', '0'::jsonb)
        ),
        'pending_review', NULL, extensions.gen_random_uuid(), p_correlation_id
      );
      v_proposal_count := v_proposal_count + 1;
    END LOOP;
  END IF;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    NULL, v_tenant_id, 'ai.voice_call_analysis.persist',
    'voice_call', v_call_id::text, 'succeeded', p_correlation_id,
    pg_catalog.jsonb_build_object(
      'provider_id', p_provider_id,
      'voice_config_id', p_voice_config_id,
      'persona_key', v_persona_key,
      'proposals_created', v_proposal_count,
      'auto_published', false
    )
  );

  RETURN QUERY SELECT v_call_id, false, v_proposal_count;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_e_record_voice_call_analysis(
  uuid,uuid,uuid,uuid,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_e_record_voice_call_analysis(
  uuid,uuid,uuid,uuid,jsonb
) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Legacy knowledge remains readable but cannot be browser-published
-- ---------------------------------------------------------------------------

-- Legacy rows remain readable for backward compatibility. New call analysis is
-- persisted transactionally as pending ai_content_change_proposals by the RPC
-- above; browser sessions cannot turn either source into runtime knowledge.
ALTER TABLE public.voice_agent_knowledge
  ALTER COLUMN is_active SET DEFAULT false;
DROP POLICY IF EXISTS phase_c_voice_agent_knowledge_insert
  ON public.voice_agent_knowledge;
DROP POLICY IF EXISTS phase_c_voice_agent_knowledge_update
  ON public.voice_agent_knowledge;
DROP POLICY IF EXISTS phase_c_voice_agent_knowledge_delete
  ON public.voice_agent_knowledge;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.voice_agent_knowledge
  FROM authenticated;
GRANT SELECT ON TABLE public.voice_agent_knowledge TO authenticated;

COMMENT ON TABLE public.ai_content_change_proposals IS
  'Canonical Phase E queue and version history. Runtime publication requires human review followed by a trusted service-role publisher; authenticated has read-only table access.';

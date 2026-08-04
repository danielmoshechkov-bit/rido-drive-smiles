-- Phase F: durable single-flight lease for paid meeting transcription.
-- The Edge endpoint authenticates the user and rate-limits first; these RPCs
-- make the provider call single-flight even under concurrent/replayed requests.

CREATE TABLE IF NOT EXISTS public.security_meeting_transcription_jobs (
  meeting_id uuid PRIMARY KEY REFERENCES public.meetings(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_fingerprint text NOT NULL CHECK (audio_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  correlation_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_:-]{1,80}$'
  ),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.security_meeting_transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_meeting_transcription_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_meeting_transcription_jobs
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.phase_f_claim_meeting_transcription(
  p_actor_id uuid,
  p_meeting_id uuid,
  p_audio_path text,
  p_audio_fingerprint text,
  p_lease_seconds integer,
  p_correlation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_job public.security_meeting_transcription_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR p_meeting_id IS NULL OR p_correlation_id IS NULL
     OR p_audio_path IS NULL OR length(p_audio_path) NOT BETWEEN 10 AND 500
     OR p_audio_fingerprint IS NULL OR p_audio_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_lease_seconds NOT BETWEEN 60 AND 3600 THEN
    RAISE EXCEPTION 'invalid_transcription_claim' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.meetings AS meeting
    WHERE meeting.id = p_meeting_id
      AND meeting.user_id = p_actor_id
      AND meeting.audio_url = p_audio_path
  ) THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, NULL, 'meeting.transcription_claim', 'meeting', p_meeting_id::text,
      'denied', p_correlation_id, jsonb_build_object('reason', 'ownership_or_audio_mismatch')
    );
    RAISE EXCEPTION 'transcription_access_denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.security_meeting_transcription_jobs (
    meeting_id, actor_id, audio_fingerprint, status, attempts,
    correlation_id, claimed_at, lease_expires_at, updated_at
  ) VALUES (
    p_meeting_id, p_actor_id, p_audio_fingerprint, 'processing', 1,
    p_correlation_id, v_now, v_now + make_interval(secs => p_lease_seconds), v_now
  )
  ON CONFLICT (meeting_id) DO NOTHING
  RETURNING * INTO v_job;

  IF FOUND THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, NULL, 'meeting.transcription_claim', 'meeting', p_meeting_id::text,
      'attempted', p_correlation_id, jsonb_build_object('attempt', 1)
    );
    RETURN 'claimed';
  END IF;

  SELECT * INTO v_job
  FROM public.security_meeting_transcription_jobs
  WHERE meeting_id = p_meeting_id
  FOR UPDATE;

  IF v_job.actor_id IS DISTINCT FROM p_actor_id THEN
    INSERT INTO public.security_audit_log (
      actor_id, tenant_id, action, resource_type, resource_id,
      result, correlation_id, metadata
    ) VALUES (
      p_actor_id, NULL, 'meeting.transcription_claim', 'meeting', p_meeting_id::text,
      'denied', p_correlation_id, jsonb_build_object('reason', 'actor_binding_mismatch')
    );
    RAISE EXCEPTION 'transcription_claim_binding_denied' USING ERRCODE = '42501';
  END IF;

  IF v_job.status = 'succeeded' THEN
    RETURN 'succeeded';
  END IF;
  IF v_job.status = 'processing' AND v_job.lease_expires_at > v_now THEN
    RETURN 'in_progress';
  END IF;

  UPDATE public.security_meeting_transcription_jobs
  SET audio_fingerprint = p_audio_fingerprint,
      status = 'processing',
      attempts = attempts + 1,
      correlation_id = p_correlation_id,
      claimed_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      completed_at = NULL,
      last_error_code = NULL,
      updated_at = v_now
  WHERE meeting_id = p_meeting_id;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, NULL, 'meeting.transcription_claim', 'meeting', p_meeting_id::text,
    'attempted', p_correlation_id, jsonb_build_object('attempt', v_job.attempts + 1)
  );
  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.phase_f_finalize_meeting_transcription(
  p_actor_id uuid,
  p_meeting_id uuid,
  p_audio_fingerprint text,
  p_correlation_id uuid,
  p_succeeded boolean,
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
  IF p_actor_id IS NULL OR p_meeting_id IS NULL OR p_correlation_id IS NULL
     OR p_succeeded IS NULL
     OR p_audio_fingerprint IS NULL OR p_audio_fingerprint !~ '^[0-9a-f]{64}$'
     OR (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_:-]{1,80}$') THEN
    RAISE EXCEPTION 'invalid_transcription_finalize' USING ERRCODE = '22023';
  END IF;

  UPDATE public.security_meeting_transcription_jobs
  SET status = v_status,
      completed_at = clock_timestamp(),
      lease_expires_at = clock_timestamp(),
      last_error_code = CASE WHEN p_succeeded THEN NULL ELSE p_error_code END,
      updated_at = clock_timestamp()
  WHERE meeting_id = p_meeting_id
    AND actor_id = p_actor_id
    AND audio_fingerprint = p_audio_fingerprint
    AND correlation_id = p_correlation_id
    AND status = 'processing';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.security_audit_log (
    actor_id, tenant_id, action, resource_type, resource_id,
    result, correlation_id, metadata
  ) VALUES (
    p_actor_id, NULL, 'meeting.transcription', 'meeting', p_meeting_id::text,
    CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
    p_correlation_id,
    CASE WHEN p_succeeded THEN '{}'::jsonb ELSE jsonb_build_object('error_code', p_error_code) END
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_f_claim_meeting_transcription(
  uuid, uuid, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_f_claim_meeting_transcription(
  uuid, uuid, text, text, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.phase_f_finalize_meeting_transcription(
  uuid, uuid, text, uuid, boolean, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_f_finalize_meeting_transcription(
  uuid, uuid, text, uuid, boolean, text
) TO service_role;

-- Indeksy i agregat dla zewnętrznego monitoringu. Funkcja zwraca wyłącznie
-- liczniki i czas ostatniego sygnału, nigdy metadata ani dane podmiotu.
CREATE INDEX IF NOT EXISTS security_audit_log_action_time_idx
  ON public.security_audit_log (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_result_time_idx
  ON public.security_audit_log (result, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.phase_f_security_signal_summary(
  p_since timestamptz DEFAULT (clock_timestamp() - interval '1 hour'),
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  signal text,
  event_count bigint,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  IF p_since IS NULL
     OR p_since < clock_timestamp() - interval '7 days'
     OR p_since > clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_monitoring_window' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH classified AS (
    SELECT
      CASE
        WHEN audit.action = 'rate_limit.exceeded'
          THEN 'rate_limit_exceeded'
        WHEN audit.action LIKE '%.replay%'
          OR COALESCE(audit.metadata ->> 'reason', '') LIKE '%replay%'
          THEN 'replay_attempt'
        WHEN audit.result = 'denied' AND (
          audit.action LIKE '%tenant%'
          OR COALESCE(audit.metadata ->> 'reason', '') LIKE '%tenant%'
        ) THEN 'cross_tenant_attempt'
        WHEN audit.action LIKE 'payment.%' AND audit.result IN ('denied', 'failed')
          THEN 'payment_failure_or_denial'
        WHEN audit.action LIKE 'admin.%'
          THEN 'admin_activity'
        WHEN audit.action LIKE 'ai.%' AND audit.result IN ('denied', 'failed')
          THEN 'ai_failure_or_denial'
        WHEN audit.action LIKE '%.tool%' AND audit.result IN ('attempted', 'succeeded', 'denied', 'failed')
          THEN 'ai_tool_activity'
        WHEN audit.action LIKE '%password%' AND audit.result IN ('attempted', 'succeeded', 'denied', 'failed')
          THEN 'credential_activity'
        WHEN audit.action LIKE 'ksef.%' AND audit.result IN ('attempted', 'succeeded', 'denied', 'failed')
          THEN 'ksef_activity'
        WHEN audit.action LIKE 'sms.%' OR audit.action LIKE 'mail.send%'
          THEN 'message_send_activity'
        ELSE NULL
      END AS signal_name,
      audit.occurred_at
    FROM public.security_audit_log AS audit
    WHERE audit.occurred_at >= p_since
      AND (p_tenant_id IS NULL OR audit.tenant_id = p_tenant_id)
  )
  SELECT classified.signal_name, count(*)::bigint, max(classified.occurred_at)
  FROM classified
  WHERE classified.signal_name IS NOT NULL
  GROUP BY classified.signal_name
  ORDER BY max(classified.occurred_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.phase_f_security_signal_summary(timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase_f_security_signal_summary(timestamptz, uuid)
  TO service_role;

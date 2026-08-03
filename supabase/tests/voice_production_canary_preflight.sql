-- READ-ONLY preflight przed migracjami produkcyjnego canary agenta głosowego.
-- Wymaga psql variables, ale nigdy ich nie wypisuje:
--   -v canary_provider_id='...uuid...' -v canary_agent_id='...opaque...'
-- Uruchomić z -X -v ON_ERROR_STOP=1. Skrypt nie tworzy obiektów i kończy
-- transakcję przez ROLLBACK także po sukcesie.

\if :{?canary_provider_id}
\else
  \echo 'BLOCKED: missing psql variable canary_provider_id'
  \quit 3
\endif
\if :{?canary_agent_id}
\else
  \echo 'BLOCKED: missing psql variable canary_agent_id'
  \quit 3
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';

-- Store opaque inputs transaction-locally without printing them.
SELECT set_config('voice_canary.provider_id', :'canary_provider_id', true) AS provider_setting \gset
SELECT set_config('voice_canary.agent_id', :'canary_agent_id', true) AS agent_setting \gset

WITH required(table_name, column_name) AS (VALUES
  ('voice_calls', 'id'), ('voice_calls', 'provider_id'),
  ('voice_calls', 'elevenlabs_conversation_id'), ('voice_calls', 'linked_entity_type'),
  ('voice_calls', 'linked_entity_id'), ('voice_calls', 'status'),
  ('voice_calls', 'ended_at'), ('voice_calls', 'created_at'),
  ('voice_transcripts', 'id'), ('voice_transcripts', 'call_id'),
  ('voice_transcripts', 'provider_id'), ('voice_transcripts', 'created_at'),
  ('voice_call_outcomes', 'id'), ('voice_call_outcomes', 'call_id'),
  ('voice_call_outcomes', 'provider_id'), ('voice_call_outcomes', 'analyzed_at'),
  ('voice_call_outcomes', 'created_at'),
  ('voice_agent_configs', 'provider_id'), ('voice_agent_configs', 'persona_key'),
  ('voice_agent_configs', 'elevenlabs_agent_id'), ('voice_agent_configs', 'is_active'),
  ('voice_agent_configs', 'privacy_confirmed'), ('voice_agent_configs', 'calendar_access'),
  ('voice_agent_configs', 'orders_access'),
  ('ai_function_mapping', 'function_key'), ('ai_function_mapping', 'provider_key'),
  ('ai_function_mapping', 'model_override'), ('ai_function_mapping', 'backup_provider_key'),
  ('ai_function_mapping', 'allow_fallback'), ('ai_function_mapping', 'is_enabled')
), missing AS (
  SELECT required.*
  FROM required
  LEFT JOIN information_schema.columns actual
    ON actual.table_schema = 'public'
   AND actual.table_name = required.table_name
   AND actual.column_name = required.column_name
  WHERE actual.column_name IS NULL
)
SELECT 'required_schema_columns' AS check_name,
       count(*) = 0 AS passed,
       count(*)::text AS detail
FROM missing;

SELECT 'target_config_exact_pair' AS check_name,
       count(*) = 1 AS passed,
       count(*)::text AS detail
FROM public.voice_agent_configs
WHERE provider_id = current_setting('voice_canary.provider_id')::uuid
  AND elevenlabs_agent_id = current_setting('voice_canary.agent_id');

SELECT 'target_config_operational_flags' AS check_name,
       count(*) = 1 AS passed,
       count(*)::text AS detail
FROM public.voice_agent_configs
WHERE provider_id = current_setting('voice_canary.provider_id')::uuid
  AND elevenlabs_agent_id = current_setting('voice_canary.agent_id')
  AND is_active AND privacy_confirmed AND calendar_access AND orders_access;

SELECT 'agent_not_reused_by_other_provider' AS check_name,
       count(*) = 0 AS passed,
       count(*)::text AS detail
FROM public.voice_agent_configs
WHERE elevenlabs_agent_id = current_setting('voice_canary.agent_id')
  AND provider_id <> current_setting('voice_canary.provider_id')::uuid;

SELECT 'duplicate_voice_conversations' AS check_name,
       true AS passed,
       count(*)::text AS detail
FROM (
  SELECT 1
  FROM public.voice_calls
  WHERE elevenlabs_conversation_id IS NOT NULL
  GROUP BY provider_id, elevenlabs_conversation_id
  HAVING count(*) > 1
) duplicates;

SELECT 'duplicate_transcripts' AS check_name,
       true AS passed,
       count(*)::text AS detail
FROM (SELECT 1 FROM public.voice_transcripts GROUP BY call_id HAVING count(*) > 1) duplicates;

SELECT 'duplicate_outcomes' AS check_name,
       true AS passed,
       count(*)::text AS detail
FROM (SELECT 1 FROM public.voice_call_outcomes GROUP BY call_id HAVING count(*) > 1) duplicates;

SELECT 'orphan_transcripts' AS check_name,
       count(*) = 0 AS passed,
       count(*)::text AS detail
FROM public.voice_transcripts transcript
LEFT JOIN public.voice_calls call_record ON call_record.id = transcript.call_id
WHERE call_record.id IS NULL;

SELECT 'orphan_outcomes' AS check_name,
       count(*) = 0 AS passed,
       count(*)::text AS detail
FROM public.voice_call_outcomes outcome
LEFT JOIN public.voice_calls call_record ON call_record.id = outcome.call_id
WHERE call_record.id IS NULL;

-- Jakikolwiek obiekt docelowych migracji oznacza stan częściowy albo wcześniejsze
-- zastosowanie. Nie wolno wtedy uruchamiać plików ponownie bez osobnego audytu.
WITH target_objects AS (
  SELECT count(*)::bigint AS object_count
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname IN (
    'voice_deduplication_archive',
    'uq_voice_calls_provider_conversation',
    'uq_voice_transcripts_call',
    'uq_voice_call_outcomes_call',
    'uq_service_bookings_voice_conversation',
    'uq_workshop_orders_voice_conversation'
  )
), target_columns AS (
  SELECT count(*)::bigint AS column_count
  FROM information_schema.columns
  WHERE (table_schema, table_name, column_name) IN (
    ('public', 'service_bookings', 'voice_conversation_id'),
    ('public', 'workshop_orders', 'voice_conversation_id'),
    ('public', 'voice_agent_configs', 'turn_timeout_seconds'),
    ('public', 'voice_agent_configs', 'silence_end_call_timeout_seconds'),
    ('public', 'voice_agent_configs', 'soft_timeout_seconds'),
    ('public', 'ai_function_mapping', 'backup_model_override'),
    ('public', 'ai_function_mapping', 'model_timeout_ms'),
    ('public', 'ai_function_mapping', 'max_tool_rounds'),
    ('public', 'ai_function_mapping', 'max_output_tokens')
  )
)
SELECT 'migration_not_partially_applied' AS check_name,
       object_count = 0 AND column_count = 0 AS passed,
       format('objects=%s columns=%s', object_count, column_count) AS detail
FROM target_objects CROSS JOIN target_columns;

SELECT 'long_running_transactions' AS check_name,
       count(*) = 0 AS passed,
       count(*)::text AS detail
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND xact_start IS NOT NULL
  AND clock_timestamp() - xact_start > interval '60 seconds';

SELECT relname AS relation_name,
       pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
       COALESCE(reltuples, 0)::bigint AS estimated_rows
FROM pg_class
WHERE oid IN (
  'public.voice_calls'::regclass,
  'public.voice_transcripts'::regclass,
  'public.voice_call_outcomes'::regclass,
  'public.service_bookings'::regclass,
  'public.workshop_orders'::regclass
)
ORDER BY pg_total_relation_size(oid) DESC;

DO $preflight$
BEGIN
  IF EXISTS (
    WITH required(table_name, column_name) AS (VALUES
      ('voice_calls', 'id'), ('voice_calls', 'provider_id'),
      ('voice_calls', 'elevenlabs_conversation_id'), ('voice_calls', 'linked_entity_type'),
      ('voice_calls', 'linked_entity_id'), ('voice_calls', 'status'),
      ('voice_calls', 'ended_at'), ('voice_calls', 'created_at'),
      ('voice_transcripts', 'id'), ('voice_transcripts', 'call_id'),
      ('voice_transcripts', 'provider_id'), ('voice_transcripts', 'created_at'),
      ('voice_call_outcomes', 'id'), ('voice_call_outcomes', 'call_id'),
      ('voice_call_outcomes', 'provider_id'), ('voice_call_outcomes', 'analyzed_at'),
      ('voice_call_outcomes', 'created_at'),
      ('voice_agent_configs', 'provider_id'), ('voice_agent_configs', 'persona_key'),
      ('voice_agent_configs', 'elevenlabs_agent_id'), ('voice_agent_configs', 'is_active'),
      ('voice_agent_configs', 'privacy_confirmed'), ('voice_agent_configs', 'calendar_access'),
      ('voice_agent_configs', 'orders_access'),
      ('ai_function_mapping', 'function_key'), ('ai_function_mapping', 'provider_key'),
      ('ai_function_mapping', 'model_override'), ('ai_function_mapping', 'backup_provider_key'),
      ('ai_function_mapping', 'allow_fallback'), ('ai_function_mapping', 'is_enabled')
    )
    SELECT 1
    FROM required
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
     AND actual.table_name = required.table_name
     AND actual.column_name = required.column_name
    WHERE actual.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: required schema columns are missing';
  END IF;
  IF (SELECT count(*) FROM public.voice_agent_configs
      WHERE provider_id = current_setting('voice_canary.provider_id')::uuid
        AND elevenlabs_agent_id = current_setting('voice_canary.agent_id')) <> 1 THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: target provider/agent pair is not unique';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.voice_agent_configs
    WHERE provider_id = current_setting('voice_canary.provider_id')::uuid
      AND elevenlabs_agent_id = current_setting('voice_canary.agent_id')
      AND is_active AND privacy_confirmed AND calendar_access AND orders_access
  ) THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: target configuration is not operational';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.voice_agent_configs
    WHERE elevenlabs_agent_id = current_setting('voice_canary.agent_id')
      AND provider_id <> current_setting('voice_canary.provider_id')::uuid
  ) THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: ElevenLabs agent is mapped to another provider';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.voice_transcripts transcript
    LEFT JOIN public.voice_calls call_record ON call_record.id = transcript.call_id
    WHERE call_record.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.voice_call_outcomes outcome
    LEFT JOIN public.voice_calls call_record ON call_record.id = outcome.call_id
    WHERE call_record.id IS NULL
  ) THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: orphan voice records exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN (
      'voice_deduplication_archive',
      'uq_voice_calls_provider_conversation',
      'uq_voice_transcripts_call',
      'uq_voice_call_outcomes_call',
      'uq_service_bookings_voice_conversation',
      'uq_workshop_orders_voice_conversation'
    )
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE (table_schema, table_name, column_name) IN (
      ('public', 'service_bookings', 'voice_conversation_id'),
      ('public', 'workshop_orders', 'voice_conversation_id'),
      ('public', 'voice_agent_configs', 'turn_timeout_seconds'),
      ('public', 'voice_agent_configs', 'silence_end_call_timeout_seconds'),
      ('public', 'voice_agent_configs', 'soft_timeout_seconds'),
      ('public', 'ai_function_mapping', 'backup_model_override'),
      ('public', 'ai_function_mapping', 'model_timeout_ms'),
      ('public', 'ai_function_mapping', 'max_tool_rounds'),
      ('public', 'ai_function_mapping', 'max_output_tokens')
    )
  ) THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: migration is already or partially applied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND xact_start IS NOT NULL
      AND clock_timestamp() - xact_start > interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'CANARY PREFLIGHT BLOCKED: long-running transaction exists';
  END IF;
END
$preflight$;

ROLLBACK;

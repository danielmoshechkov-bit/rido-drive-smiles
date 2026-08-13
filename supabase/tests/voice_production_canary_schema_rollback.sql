-- Awaryjny, niedestrukcyjny rollback egzekwowania schematu voice canary.
-- Najpierw należy wyłączyć kill switch i przywrócić poprzednie Edge Functions.
-- Skrypt celowo zachowuje kolumny, archiwum i dane utworzone po migracji.
-- Uruchamiać wyłącznie ręcznie z psql -X -v ON_ERROR_STOP=1 oraz:
--   -v confirm_schema_rollback='ROLLBACK_VOICE_CANARY_SCHEMA'

\if :{?confirm_schema_rollback}
\else
  \echo 'BLOCKED: missing explicit schema rollback confirmation'
  \quit 3
\endif
SELECT :'confirm_schema_rollback' = 'ROLLBACK_VOICE_CANARY_SCHEMA' AS rollback_confirmed \gset
\if :rollback_confirmed
\else
  \echo 'BLOCKED: invalid schema rollback confirmation'
  \quit 3
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE public.voice_calls, public.voice_transcripts, public.voice_call_outcomes,
  public.service_bookings, public.workshop_orders, public.ai_function_mapping
  IN SHARE ROW EXCLUSIVE MODE;

DROP INDEX IF EXISTS public.uq_voice_calls_provider_conversation;
DROP INDEX IF EXISTS public.uq_voice_transcripts_call;
DROP INDEX IF EXISTS public.uq_voice_call_outcomes_call;
DROP INDEX IF EXISTS public.uq_service_bookings_voice_conversation;
DROP INDEX IF EXISTS public.uq_workshop_orders_voice_conversation;
DROP INDEX IF EXISTS public.idx_voice_calls_linked_entity;

ALTER TABLE public.voice_agent_configs
  DROP CONSTRAINT IF EXISTS voice_agent_turn_timeout_range,
  DROP CONSTRAINT IF EXISTS voice_agent_silence_timeout_range,
  DROP CONSTRAINT IF EXISTS voice_agent_soft_timeout_range;

ALTER TABLE public.ai_function_mapping
  DROP CONSTRAINT IF EXISTS ai_function_mapping_model_timeout_range,
  DROP CONSTRAINT IF EXISTS ai_function_mapping_tool_rounds_range,
  DROP CONSTRAINT IF EXISTS ai_function_mapping_output_tokens_range;

-- Przywrócenie kontraktu starego panelu mapowania. Bezpieczne ograniczenie
-- dostępu do api_providers.api_key_encrypted pozostaje celowo w mocy.
DROP POLICY IF EXISTS "Admins manage non-voice ai_function_mapping" ON public.ai_function_mapping;
DROP POLICY IF EXISTS "Admins can manage ai_function_mapping" ON public.ai_function_mapping;
CREATE POLICY "Admins can manage ai_function_mapping"
ON public.ai_function_mapping
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMIT;

-- Celowo NIE wykonywać:
-- * DROP COLUMN voice_conversation_id / pól timeoutu i routingu,
-- * DROP TABLE voice_deduplication_archive,
-- * odtwarzania duplikatów do tabel operacyjnych.
-- To zachowuje wszystkie dane i pozwala na późniejszy, audytowalny replay z
-- row_data. Funkcje sprzed migracji ignorują dodatkowe kolumny.

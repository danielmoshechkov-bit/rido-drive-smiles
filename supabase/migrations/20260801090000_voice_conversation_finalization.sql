-- Idempotentny zapis końcowych webhooków ElevenLabs i konfiguracja ciszy.
-- Historyczne duplikaty są archiwizowane w całości przed wprowadzeniem
-- unikalności. Migracja nie wymaga dostępu do zewnętrznych usług.

CREATE TABLE IF NOT EXISTS public.voice_deduplication_archive (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL CHECK (entity_type IN ('voice_call', 'voice_transcript', 'voice_call_outcome')),
  source_id     uuid NOT NULL,
  canonical_id  uuid NOT NULL,
  provider_id   uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  row_data      jsonb NOT NULL,
  archived_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_dedup_archive_provider
  ON public.voice_deduplication_archive(provider_id, archived_at DESC);

ALTER TABLE public.voice_deduplication_archive ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.voice_deduplication_archive TO authenticated;
GRANT ALL ON public.voice_deduplication_archive TO service_role;

DROP POLICY IF EXISTS "voice_dedup_archive_provider_read" ON public.voice_deduplication_archive;
CREATE POLICY "voice_dedup_archive_provider_read" ON public.voice_deduplication_archive
  FOR SELECT TO authenticated
  USING (
    provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Zapobiega nowym duplikatom między konsolidacją a CREATE UNIQUE INDEX.
LOCK TABLE public.voice_calls, public.voice_transcripts, public.voice_call_outcomes
  IN SHARE ROW EXCLUSIVE MODE;

-- 1. Zduplikowane conversation_id. Rekord powiązany ze zleceniem ma
-- pierwszeństwo, potem completed, a następnie najnowszy rekord.
-- Pozostałe voice_calls pozostają w bazie ze wszystkimi relacjami; po
-- archiwizacji czyszczony jest wyłącznie kolidujący conversation_id.
CREATE TEMP TABLE _duplicate_voice_calls ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    provider_id,
    elevenlabs_conversation_id,
    row_number() OVER (
      PARTITION BY provider_id, elevenlabs_conversation_id
      ORDER BY
        (linked_entity_type = 'workshop_order' AND linked_entity_id IS NOT NULL) DESC,
        (status = 'completed') DESC,
        ended_at DESC NULLS LAST,
        created_at DESC,
        id DESC
    ) AS duplicate_rank
  FROM public.voice_calls
  WHERE elevenlabs_conversation_id IS NOT NULL
), winners AS (
  SELECT provider_id, elevenlabs_conversation_id, id AS canonical_id
  FROM ranked
  WHERE duplicate_rank = 1
)
SELECT ranked.id AS source_id, winners.canonical_id, ranked.provider_id
FROM ranked
JOIN winners USING (provider_id, elevenlabs_conversation_id)
WHERE ranked.duplicate_rank > 1;

INSERT INTO public.voice_deduplication_archive
  (entity_type, source_id, canonical_id, provider_id, row_data)
SELECT 'voice_call', duplicate.id, mapping.canonical_id, mapping.provider_id, to_jsonb(duplicate)
FROM _duplicate_voice_calls mapping
JOIN public.voice_calls duplicate ON duplicate.id = mapping.source_id
ON CONFLICT (entity_type, source_id) DO NOTHING;

UPDATE public.voice_calls duplicate
SET elevenlabs_conversation_id = NULL
FROM _duplicate_voice_calls mapping
JOIN public.voice_deduplication_archive archived
  ON archived.entity_type = 'voice_call'
 AND archived.source_id = mapping.source_id
 AND archived.canonical_id = mapping.canonical_id
 AND archived.row_data ->> 'id' = mapping.source_id::text
WHERE duplicate.id = mapping.source_id;

-- 2. Wielokrotne transkrypcje jednego call_id. Zachowujemy najnowszy
-- created_at/id, starsze pełne wiersze przenosimy do archiwum.
CREATE TEMP TABLE _duplicate_voice_transcripts ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    transcript.id,
    transcript.call_id,
    call_record.provider_id,
    row_number() OVER (
      PARTITION BY transcript.call_id
      ORDER BY transcript.created_at DESC, transcript.id DESC
    ) AS duplicate_rank
  FROM public.voice_transcripts transcript
  JOIN public.voice_calls call_record ON call_record.id = transcript.call_id
), winners AS (
  SELECT call_id, id AS canonical_id
  FROM ranked
  WHERE duplicate_rank = 1
)
SELECT ranked.id AS source_id, winners.canonical_id, ranked.provider_id
FROM ranked
JOIN winners USING (call_id)
WHERE ranked.duplicate_rank > 1;

INSERT INTO public.voice_deduplication_archive
  (entity_type, source_id, canonical_id, provider_id, row_data)
SELECT 'voice_transcript', duplicate.id, mapping.canonical_id, mapping.provider_id, to_jsonb(duplicate)
FROM _duplicate_voice_transcripts mapping
JOIN public.voice_transcripts duplicate ON duplicate.id = mapping.source_id
ON CONFLICT (entity_type, source_id) DO NOTHING;

DELETE FROM public.voice_transcripts duplicate
USING _duplicate_voice_transcripts mapping, public.voice_deduplication_archive archived
WHERE duplicate.id = mapping.source_id
  AND archived.entity_type = 'voice_transcript'
  AND archived.source_id = mapping.source_id
  AND archived.canonical_id = mapping.canonical_id
  AND archived.row_data ->> 'id' = mapping.source_id::text;

-- 3. Wielokrotne wyniki analizy jednego call_id. Zachowujemy najnowszy
-- analyzed_at/created_at/id, starsze pełne wiersze przenosimy do archiwum.
CREATE TEMP TABLE _duplicate_voice_outcomes ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    outcome.id,
    outcome.call_id,
    call_record.provider_id,
    row_number() OVER (
      PARTITION BY outcome.call_id
      ORDER BY COALESCE(outcome.analyzed_at, outcome.created_at) DESC,
        outcome.created_at DESC, outcome.id DESC
    ) AS duplicate_rank
  FROM public.voice_call_outcomes outcome
  JOIN public.voice_calls call_record ON call_record.id = outcome.call_id
), winners AS (
  SELECT call_id, id AS canonical_id
  FROM ranked
  WHERE duplicate_rank = 1
)
SELECT ranked.id AS source_id, winners.canonical_id, ranked.provider_id
FROM ranked
JOIN winners USING (call_id)
WHERE ranked.duplicate_rank > 1;

INSERT INTO public.voice_deduplication_archive
  (entity_type, source_id, canonical_id, provider_id, row_data)
SELECT 'voice_call_outcome', duplicate.id, mapping.canonical_id, mapping.provider_id, to_jsonb(duplicate)
FROM _duplicate_voice_outcomes mapping
JOIN public.voice_call_outcomes duplicate ON duplicate.id = mapping.source_id
ON CONFLICT (entity_type, source_id) DO NOTHING;

DELETE FROM public.voice_call_outcomes duplicate
USING _duplicate_voice_outcomes mapping, public.voice_deduplication_archive archived
WHERE duplicate.id = mapping.source_id
  AND archived.entity_type = 'voice_call_outcome'
  AND archived.source_id = mapping.source_id
  AND archived.canonical_id = mapping.canonical_id
  AND archived.row_data ->> 'id' = mapping.source_id::text;

-- Fail closed: żaden indeks unikalny nie powstanie, jeżeli konsolidacja nie
-- doprowadziła tabel do oczekiwanej kardynalności.
DO $check_voice_deduplication_result$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.voice_calls
    WHERE elevenlabs_conversation_id IS NOT NULL
    GROUP BY provider_id, elevenlabs_conversation_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.voice_transcripts GROUP BY call_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.voice_call_outcomes GROUP BY call_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'voice deduplication failed final cardinality check';
  END IF;
END
$check_voice_deduplication_result$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_calls_provider_conversation
  ON public.voice_calls(provider_id, elevenlabs_conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_transcripts_call
  ON public.voice_transcripts(call_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_call_outcomes_call
  ON public.voice_call_outcomes(call_id);

CREATE INDEX IF NOT EXISTS idx_voice_calls_linked_entity
  ON public.voice_calls(provider_id, linked_entity_type, linked_entity_id)
  WHERE linked_entity_id IS NOT NULL;

ALTER TABLE public.service_bookings
  ADD COLUMN IF NOT EXISTS voice_conversation_id text;

ALTER TABLE public.workshop_orders
  ADD COLUMN IF NOT EXISTS voice_conversation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_bookings_voice_conversation
  ON public.service_bookings(provider_id, voice_conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workshop_orders_voice_conversation
  ON public.workshop_orders(provider_id, voice_conversation_id);

ALTER TABLE public.voice_agent_configs
  ADD COLUMN IF NOT EXISTS turn_timeout_seconds integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS silence_end_call_timeout_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS soft_timeout_seconds numeric(3,1) NOT NULL DEFAULT 3.0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_agent_turn_timeout_range'
      AND conrelid = 'public.voice_agent_configs'::regclass
  ) THEN
    ALTER TABLE public.voice_agent_configs
      ADD CONSTRAINT voice_agent_turn_timeout_range
      CHECK (turn_timeout_seconds BETWEEN 1 AND 30);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_agent_silence_timeout_range'
      AND conrelid = 'public.voice_agent_configs'::regclass
  ) THEN
    ALTER TABLE public.voice_agent_configs
      ADD CONSTRAINT voice_agent_silence_timeout_range
      CHECK (silence_end_call_timeout_seconds BETWEEN 15 AND 300);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voice_agent_soft_timeout_range'
      AND conrelid = 'public.voice_agent_configs'::regclass
  ) THEN
    ALTER TABLE public.voice_agent_configs
      ADD CONSTRAINT voice_agent_soft_timeout_range
      CHECK (soft_timeout_seconds BETWEEN 0.5 AND 8.0);
  END IF;
END $$;

-- Uruchomić z ON_ERROR_STOP po migracji
-- 20260801090000_voice_conversation_finalization.sql na bazie zawierającej fixture.
-- Po poprawnej walidacji syntetyczni providerzy są usuwani kaskadowo.

DO $verify_voice_finalization_p1$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.voice_calls
    WHERE id = '90000000-0000-0000-0000-0000000000a1'
      AND elevenlabs_conversation_id = 'conv_p1_fixture'
  ) THEN
    RAISE EXCEPTION 'P1 fixture: niewłaściwy canonical voice_call';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.voice_calls
    WHERE id = '90000000-0000-0000-0000-0000000000b1'
      AND elevenlabs_conversation_id IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.voice_transcripts
    WHERE id = '90000000-0000-0000-0000-0000000000c3'
      AND call_id = '90000000-0000-0000-0000-0000000000b1'
  ) THEN
    RAISE EXCEPTION 'P1 fixture: historyczny voice_call lub jego relacja nie zostały zachowane';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.voice_deduplication_archive
    WHERE entity_type = 'voice_call'
      AND source_id = '90000000-0000-0000-0000-0000000000b1'
      AND canonical_id = '90000000-0000-0000-0000-0000000000a1'
      AND row_data ->> 'elevenlabs_conversation_id' = 'conv_p1_fixture'
  ) THEN
    RAISE EXCEPTION 'P1 fixture: brak pełnego archiwum voice_call';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.voice_transcripts
    WHERE id = '90000000-0000-0000-0000-0000000000c1'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.voice_transcripts
    WHERE id = '90000000-0000-0000-0000-0000000000c2'
      AND full_text = 'nowszy transkrypt bieżący'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.voice_deduplication_archive
    WHERE entity_type = 'voice_transcript'
      AND source_id = '90000000-0000-0000-0000-0000000000c1'
      AND canonical_id = '90000000-0000-0000-0000-0000000000c2'
      AND provider_id = '90000000-0000-0000-0000-000000000001'
      AND row_data ->> 'provider_id' = '90000000-0000-0000-0000-000000000002'
      AND row_data ->> 'full_text' = 'starszy transkrypt do zachowania'
      AND row_data ->> 'summary' = 'starsze podsumowanie'
  ) THEN
    RAISE EXCEPTION 'P1 fixture: transkrypcja nie została poprawnie zachowana';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.voice_call_outcomes
    WHERE id = '90000000-0000-0000-0000-0000000000d1'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.voice_call_outcomes
    WHERE id = '90000000-0000-0000-0000-0000000000d2' AND outcome = 'booked'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.voice_deduplication_archive
    WHERE entity_type = 'voice_call_outcome'
      AND source_id = '90000000-0000-0000-0000-0000000000d1'
      AND canonical_id = '90000000-0000-0000-0000-0000000000d2'
      AND provider_id = '90000000-0000-0000-0000-000000000001'
      AND row_data ->> 'provider_id' = '90000000-0000-0000-0000-000000000002'
      AND row_data ->> 'outcome' = 'callback'
      AND row_data -> 'customer_data' ->> 'fixture' = 'starszy wynik'
  ) THEN
    RAISE EXCEPTION 'P1 fixture: wynik analizy nie został poprawnie zachowany';
  END IF;

  IF to_regclass('public.uq_voice_calls_provider_conversation') IS NULL
    OR to_regclass('public.uq_voice_transcripts_call') IS NULL
    OR to_regclass('public.uq_voice_call_outcomes_call') IS NULL THEN
    RAISE EXCEPTION 'P1 fixture: brak indeksów unikalnych';
  END IF;
END
$verify_voice_finalization_p1$;

DELETE FROM public.voice_deduplication_archive
WHERE provider_id = '90000000-0000-0000-0000-000000000001';

DELETE FROM public.service_providers
WHERE id IN (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002'
);

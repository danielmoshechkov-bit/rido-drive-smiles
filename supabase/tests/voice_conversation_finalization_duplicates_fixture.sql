-- WYŁĄCZNIE lokalna/stagingowa baza testowa, przed migracją
-- 20260801090000_voice_conversation_finalization.sql.
-- Nie uruchamiać na produkcji. Stałe UUID i dane są całkowicie syntetyczne.

INSERT INTO public.service_providers (id, company_name, status)
VALUES
  ('90000000-0000-0000-0000-000000000001', 'P1 Voice Migration Fixture A', 'pending'),
  ('90000000-0000-0000-0000-000000000002', 'P1 Voice Migration Fixture B', 'pending');

INSERT INTO public.voice_calls (
  id, provider_id, persona_key, direction, status, elevenlabs_conversation_id,
  linked_entity_type, linked_entity_id, ended_at, created_at
) VALUES
  (
    '90000000-0000-0000-0000-0000000000a1',
    '90000000-0000-0000-0000-000000000001',
    'workshop_secretary', 'inbound', 'completed', 'conv_p1_fixture',
    'workshop_order', '90000000-0000-0000-0000-000000000099',
    '2026-01-01T10:10:00Z', '2026-01-01T10:00:00Z'
  ),
  (
    '90000000-0000-0000-0000-0000000000b1',
    '90000000-0000-0000-0000-000000000001',
    'workshop_secretary', 'inbound', 'completed', 'conv_p1_fixture',
    NULL, NULL, '2026-01-02T10:10:00Z', '2026-01-02T10:00:00Z'
  );

INSERT INTO public.voice_transcripts (
  id, call_id, provider_id, turns, full_text, summary, created_at
) VALUES
  (
    '90000000-0000-0000-0000-0000000000c1',
    '90000000-0000-0000-0000-0000000000a1',
    '90000000-0000-0000-0000-000000000002',
    '[{"role":"user","content":"starsza treść"}]'::jsonb,
    'starszy transkrypt do zachowania', 'starsze podsumowanie', '2026-01-01T10:11:00Z'
  ),
  (
    '90000000-0000-0000-0000-0000000000c2',
    '90000000-0000-0000-0000-0000000000a1',
    '90000000-0000-0000-0000-000000000001',
    '[{"role":"user","content":"nowsza treść"}]'::jsonb,
    'nowszy transkrypt bieżący', 'nowsze podsumowanie', '2026-01-01T10:12:00Z'
  ),
  (
    '90000000-0000-0000-0000-0000000000c3',
    '90000000-0000-0000-0000-0000000000b1',
    '90000000-0000-0000-0000-000000000001',
    '[{"role":"user","content":"treść drugiego call"}]'::jsonb,
    'transkrypt drugiego call', NULL, '2026-01-02T10:11:00Z'
  );

INSERT INTO public.voice_call_outcomes (
  id, call_id, provider_id, persona_key, outcome, customer_data, analyzed_at, created_at
) VALUES
  (
    '90000000-0000-0000-0000-0000000000d1',
    '90000000-0000-0000-0000-0000000000a1',
    '90000000-0000-0000-0000-000000000002',
    'workshop_secretary', 'callback', '{"fixture":"starszy wynik"}'::jsonb,
    '2026-01-01T10:11:00Z', '2026-01-01T10:11:00Z'
  ),
  (
    '90000000-0000-0000-0000-0000000000d2',
    '90000000-0000-0000-0000-0000000000a1',
    '90000000-0000-0000-0000-000000000001',
    'workshop_secretary', 'booked', '{"fixture":"nowszy wynik"}'::jsonb,
    '2026-01-01T10:12:00Z', '2026-01-01T10:12:00Z'
  );

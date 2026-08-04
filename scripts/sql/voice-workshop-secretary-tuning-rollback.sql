-- Odwrócenie scripts/sql/voice-workshop-secretary-tuning.sql
--
-- Przywraca reguły wyłączone przez tamten skrypt oraz poprzednią treść promptu
-- bazowego (stan z 2026-08-03, 482 znaki, odczytany z produkcji przed zmianą).
-- Zakres identyczny: wyłącznie persona workshop_secretary i agent
-- voice_workshop_secretary.
--
--   supabase db query --linked -f scripts/sql/voice-workshop-secretary-tuning-rollback.sql

BEGIN;

-- SEKCJA 1 — odwrócenie trzech reguł z listy podstawowej.
UPDATE public.voice_agent_knowledge
SET is_active = true
WHERE persona_key = 'workshop_secretary'
  AND id IN (
    'a1a28f41-484d-46a4-9a82-87da2c1622c4',  -- 2-3 pytania diagnostyczne
    'd7d1bbb4-8677-4f13-b9ea-f02fa3f8ed45',  -- powtarzanie imienia i nazwiska
    'c66eb806-51d3-4841-a63f-08dfa28b2eb5'   -- marka -> model -> rok -> rejestracja
  );

-- SEKCJA 2 i 2b — odwrócenie reguł zamykających rozmowę oraz powtarzania danych.
UPDATE public.voice_agent_knowledge
SET is_active = true
WHERE persona_key = 'workshop_secretary'
  AND id IN (
    '39c21e98-ed6c-47cd-b5c5-48ebed42aae3',
    '192927ae-654e-478c-a36c-5c9b10f20b0e',
    'd636e2aa-c525-4e89-8ce1-ce11ab73030f',
    '3cc481c3-f88e-4007-bf60-58bfea7b28de',
    '0c9fc1d6-0e95-4034-be39-f2db5b42ff9c',
    'c94ed983-f586-4cc3-aee9-e621902d341d',
    '9bd075d4-0ecf-4969-bfdb-4d761bad71ae',
    '1b7921da-3f82-479c-90a9-c59a338b3532'
  );

-- SEKCJA 3 — poprzednia treść promptu bazowego, bajtowo jak przed zmianą.
UPDATE public.ai_agents_config
SET system_prompt = 'Jesteś profesjonalną asystentką głosową warsztatu samochodowego. Rozmawiasz naturalnie i uprzejmie, w języku rozmówcy (PL/EN/UA/RU — wykryj i dostosuj). Cel: ustalić czego klient potrzebuje (pojazd, usługa, objaw usterki), sprawdzić wolny termin przez narzędzie check_availability i umówić wizytę przez create_booking. Bądź zwięzła, potwierdzaj ustalenia, nie obiecuj cen bez danych. Na końcu podsumuj termin i dane kontaktowe. Nigdy nie zmyślaj dostępności — zawsze użyj narzędzia.'
WHERE agent_id = 'voice_workshop_secretary';

COMMIT;

SELECT
  count(*) FILTER (WHERE is_active)     AS aktywne,
  count(*) FILTER (WHERE NOT is_active) AS wylaczone
FROM public.voice_agent_knowledge
WHERE persona_key = 'workshop_secretary';

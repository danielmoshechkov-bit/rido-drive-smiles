-- ============================================================================
-- REMIS PRIORYTETÓW PERSON — USUNIĘTY I ZABLOKOWANY
--
-- Stan przed migracją:
--     sales_agent          enabled  priority 8   ← remis
--     workshop_secretary   enabled  priority 8   ← remis
--     realestate_acquirer  enabled  priority 6   ← remis
--     service_scheduler    enabled  priority 6   ← remis
--
-- Panel „Asystent głosowy" wybierał personę zapytaniem
-- `order by priority desc limit 1`. Przy remisie PostgreSQL nie obiecuje,
-- który wiersz zwróci — plan to Seq Scan plus sortowanie po JEDNYM kluczu,
-- więc rozstrzyga fizyczna kolejność wierszy w tabeli. Ta kolejność zmienia
-- się przy każdym UPDATE.
--
-- Gdyby remis rozstrzygnął się na korzyść `sales_agent`, warsztat z działającym
-- agentem zobaczyłby pusty formularz z wyłączonym przełącznikiem, a zapis
-- założyłby drugi wiersz w `voice_agent_configs` z `is_active = false`.
--
-- Kod jest już naprawiony w dwóch miejscach (panel nie zgaduje persony,
-- `voice-agent-init` wybiera konfigurację deterministycznie). Ta migracja
-- zamyka trzecie: żeby remis nie wrócił innymi drzwiami.
-- ============================================================================

-- 1) Jawne, różne priorytety. Agent warsztatu WYŻEJ niż sprzedażowy.
UPDATE public.voice_agent_personas SET priority = 10 WHERE persona_key = 'workshop_secretary';
UPDATE public.voice_agent_personas SET priority = 8  WHERE persona_key = 'sales_agent';
UPDATE public.voice_agent_personas SET priority = 6  WHERE persona_key = 'realestate_acquirer';
UPDATE public.voice_agent_personas SET priority = 4  WHERE persona_key = 'service_scheduler';

-- 2) Remis przestaje być możliwy.
--
-- Indeks obejmuje TYLKO persony włączone: wyłączona persona nikogo nie myli,
-- a włączenie jej z zajętym priorytetem ma się nie udać — głośno, przy zapisie,
-- a nie po cichu, przy losowym rozstrzygnięciu sortowania.
--
-- SKUTEK UBOCZNY, ŚWIADOMY: dodanie nowej włączonej persony wymaga teraz
-- podania priorytetu, którego nikt nie zajmuje. Domyślną wartością kolumny
-- jest 5 i nikt jej dziś nie używa, więc pierwsza taka persona przejdzie,
-- a druga zostanie odrzucona. O to właśnie chodzi.
CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_personas_priorytet_bez_remisu
  ON public.voice_agent_personas (priority)
  WHERE enabled;

COMMENT ON INDEX public.voice_agent_personas_priorytet_bez_remisu IS
  'Dwie wlaczone persony z tym samym priorytetem = niezdefiniowany zwyciezca w '
  '"order by priority desc limit 1". Patrz supabase/functions/_shared/voicePersona.ts.';

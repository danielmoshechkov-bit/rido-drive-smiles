-- Priorytet reguł w bazie wiedzy agenta głosowego.
--
-- PROBLEM: voice-agent-chat wstrzykuje do system promptu 10 reguł posortowanych
-- wyłącznie po evidence_count. Reguły dodane ręcznie i te przeniesione z promptu
-- startują z evidence_count = 1, więc przegrywają z auto-regułami wzmacnianymi
-- przez kolejne rozmowy. Bez priorytetu przeniesienie reguł z promptu do bazy
-- oznaczałoby, że część z nich po prostu przestanie działać.
--
-- ROZWIĄZANIE: kolumna priority (int). Sortowanie zmienia się na
-- priority DESC, evidence_count DESC. Reguły systemowe i ręczne dostają 100,
-- auto-reguły 0 — konkurują więc tylko między sobą o pozostałe miejsca.
--
-- ODWRACALNOŚĆ: rollback w
-- scripts/sql/voice-knowledge-priority-rollback.sql
-- Kolumna z DEFAULT 0 nie zmienia zachowania, dopóki kod nie zacznie po niej
-- sortować — migrację można zastosować przed wdrożeniem kodu.

-- 1) Kolumna, domyślnie 0 (zachowanie auto-reguł bez zmian).
ALTER TABLE public.voice_agent_knowledge
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- 2) Reguły utworzone ręcznie (source <> 'distilled') dostają priorytet systemowy.
--    Auto-reguły zostają na 0.
UPDATE public.voice_agent_knowledge
SET priority = 100
WHERE source IS DISTINCT FROM 'distilled'
  AND priority = 0;

-- 3) Indeks pod nowe sortowanie — dokładnie takie, jakiego używa voice-agent-chat.
CREATE INDEX IF NOT EXISTS idx_vak_priority_lookup
  ON public.voice_agent_knowledge (persona_key, is_active, priority DESC, evidence_count DESC);

COMMENT ON COLUMN public.voice_agent_knowledge.priority IS
  'Priorytet wstrzykiwania do promptu. 100 = regula systemowa/reczna (nigdy nie wypada), 0 = regula wyuczona automatycznie.';

-- Weryfikacja (tylko odczyt)
SELECT priority, count(*) AS ile,
       count(*) FILTER (WHERE is_active) AS aktywne
FROM public.voice_agent_knowledge
GROUP BY priority
ORDER BY priority DESC;

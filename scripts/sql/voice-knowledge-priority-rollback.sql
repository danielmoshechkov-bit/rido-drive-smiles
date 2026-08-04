-- ODWRÓCENIE scripts/sql/voice-knowledge-priority.sql
--
-- Usuwa indeks i kolumnę priority. Dane reguł (treść, is_active, evidence_count)
-- pozostają nietknięte — kasujemy wyłącznie to, co ta migracja dodała.
--
-- UWAGA: uruchamiać dopiero po cofnięciu kodu, który sortuje po priority.
-- Sam DROP COLUMN nie usuwa żadnej reguły, ale kod oczekujący tej kolumny
-- przestałby działać.

BEGIN;

DROP INDEX IF EXISTS public.idx_vak_priority_lookup;

ALTER TABLE public.voice_agent_knowledge
  DROP COLUMN IF EXISTS priority;

COMMIT;

-- Weryfikacja: kolumna nie istnieje, reguły bez zmian.
SELECT count(*) AS regul_razem,
       count(*) FILTER (WHERE is_active) AS aktywnych
FROM public.voice_agent_knowledge;

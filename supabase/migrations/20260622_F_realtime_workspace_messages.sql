-- realtime_workspace_messages: włącz publikację realtime dla czatu Workspace
-- ---------------------------------------------------------------------
-- Czat nie odświeżał się na żywo, bo workspace_messages NIE jest w publikacji
-- supabase_realtime (0 tabel workspace w publikacji). Front ma już subskrypcję
-- (useWorkspaceChat .channel postgres_changes), ale bez publikacji baza nie
-- nadaje zmian. Ta migracja dodaje tabelę do publikacji.
--
-- ADDYTYWNE: tylko ALTER PUBLICATION ADD TABLE + REPLICA IDENTITY FULL
-- (by UPDATE/DELETE niosły pełny wiersz do filtrów). Zero zmian RLS/danych.

ALTER TABLE public.workspace_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_messages;

-- WERYFIKACJA:
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname='supabase_realtime' AND tablename='workspace_messages';  -- 1 wiersz

-- ROLLBACK:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.workspace_messages;

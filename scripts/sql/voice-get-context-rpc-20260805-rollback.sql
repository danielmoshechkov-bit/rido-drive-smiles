-- Rollback do voice-get-context-rpc-20260805.sql
--
-- Bezpieczny w każdej chwili: voice-agent-chat wraca do czterech osobnych
-- odczytów, gdy RPC zawiedzie albo nie istnieje. Usunięcie funkcji nie psuje
-- rozmowy, tylko cofa zysk na latencji.

DROP FUNCTION IF EXISTS public.get_voice_context(uuid, text);

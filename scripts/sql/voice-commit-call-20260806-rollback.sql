-- Rollback do voice-commit-call-20260806.sql
--
-- Bezpieczny: funkcja jest nowa i nikt jeszcze jej nie woła poza voice-call-commit.
-- Usunięcie NIE dotyka danych — wiersze utworzone wcześniej zostają.
-- Po usunięciu voice-call-commit zwróci błąd RPC i rozmowa trafi do kolejki
-- "wymaga uwagi" zamiast po cichu przepaść.

DROP FUNCTION IF EXISTS public.voice_commit_call(text, uuid, text, text, text, text, text, text, text, date, time, int, boolean, text);

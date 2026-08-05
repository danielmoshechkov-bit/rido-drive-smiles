-- Rollback do voice-order-sequence-20260806.sql
--
-- KOLEJNOŚĆ MA ZNACZENIE: najpierw przywróć count(*)+1 w voice_commit_call,
-- dopiero potem usuń funkcję. Odwrotnie zostawisz commit bez numeracji.
--
-- Tabela licznika zostaje celowo — trzyma stan numeracji. Usunięcie jej
-- i ponowne założenie odtworzy licznik z max(order_number), więc dane nie giną,
-- ale bez potrzeby nie ruszamy.

DROP FUNCTION IF EXISTS public.next_workshop_order_number(uuid);
-- DROP TABLE IF EXISTS public.workshop_order_counters;   -- tylko świadomie

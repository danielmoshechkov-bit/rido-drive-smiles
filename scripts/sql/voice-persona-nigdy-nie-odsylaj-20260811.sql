-- ============================================================================
-- voice-persona-nigdy-nie-odsylaj-20260811.sql
--
-- USUWA MÓJ WŁASNY BŁĄD Z WCZORAJ.
--
-- Dopisałem do promptu zdanie „Numer do warsztatu ma Pan w danych firmy —
-- proszę zadzwonić bezpośrednio". Miało być uczciwą alternatywą dla transferu,
-- którego nie mamy. W rozmowie 11.08 o 13:57 padło w najgorszym możliwym
-- momencie i w najgorszej możliwej formie:
--
--   KLIENTKA (142 s): „a jeśli z samochodem wszystko w porządku,
--                      to ja muszę płacić za diagnozę?"
--   AGENT    (151 s): „To pytanie do obsługi warsztatu — ZADZWOŃ BEZPOŚREDNIO
--                      na numer firmy."
--
-- Dwa błędy naraz: odesłanie osoby, która WŁAŚNIE DZWONI, oraz forma na „ty"
-- w rozmowie prowadzonej per „Pani". Trzecia odmowa pod rząd, sentyment −0,30.
--
-- ZASADA TWARDA: agent NIGDY nie odsyła klienta do telefonu. Klient już dzwoni.
-- To jedyna odpowiedź, która jest zawsze zła — niezależnie od pytania.
--
-- Do czasu zbudowania mechanizmu oddzwaniania (callback_requests nie istnieje,
-- CALLBACK_SMS_ENABLED = false) agent mówi prawdę, która nie odsyła:
--   „Mechanik odpowie na miejscu przy przyjęciu auta."
--
-- Rollback: voice-persona-nigdy-nie-odsylaj-20260811-rollback.sql
-- ============================================================================

BEGIN;

UPDATE ai_agents_config
   SET system_prompt = replace(
         system_prompt,
         'Nie możesz przełączyć rozmowy do człowieka — nie masz takiej możliwości. Jeśli klient o to prosi, powiedz wprost: „Nie mogę przełączyć rozmowy. Numer do warsztatu ma Pan w danych firmy powyżej — proszę zadzwonić bezpośrednio." Nigdy nie obiecuj, że ktoś oddzwoni ani że przekażesz wiadomość.',
         'NIGDY NIE ODSYŁAJ KLIENTA DO TELEFONU. Klient już dzwoni — „proszę zadzwonić do warsztatu" to jedyna odpowiedź, która jest zawsze zła, niezależnie od pytania. Nie możesz też przełączyć rozmowy do człowieka ani obiecać, że ktoś oddzwoni. Gdy nie znasz odpowiedzi, powiedz: „Nie mam tej informacji — mechanik odpowie na miejscu przy przyjęciu auta." i wróć do rozmowy.')
 WHERE agent_id = 'voice_workshop_secretary';

COMMIT;

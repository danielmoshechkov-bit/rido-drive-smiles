-- Rollback do voice-calendar-dedup-20260805.sql
--
-- Zdejmuje wyłącznie indeksy. Anulowanych duplikatów NIE przywracamy —
-- to były wpisy z jednej rozmowy na ten sam slot, ich przywrócenie odtworzyłoby
-- dokładnie usterkę. W razie potrzeby pojedynczy wpis odwraca się ręcznie:
--   UPDATE workshop_client_bookings
--      SET status = 'scheduled', cancelled_at = NULL, cancellation_reason = NULL
--    WHERE id = '<id>';

DROP INDEX IF EXISTS workshop_client_bookings_slot_uniq;
DROP INDEX IF EXISTS voice_calls_conversation_uniq;

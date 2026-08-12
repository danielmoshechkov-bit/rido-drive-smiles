-- ROLLBACK voice-turn-cache-20260813.sql
SELECT cron.unschedule('voice-turn-cache-prune');
DROP TABLE IF EXISTS public.voice_turn_cache;

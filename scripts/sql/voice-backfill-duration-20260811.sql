-- ============================================================================
-- voice-backfill-duration-20260811.sql
--
-- Uzupelnienie duration_seconds i ended_at dla rozmow historycznych.
-- Kolumny istnialy od poczatku i NIGDY nie byly wypelniane (0 z 61 wierszy) —
-- ta sama klasa co wants_cancel: pole zdefiniowane, ktorego nikt nie zapisuje.
-- Od 11.08 wypelnia je voice-call-analyze; ten plik dociaga historie.
--
-- Zrodlo: metryki ElevenLabs (call_duration_secs, start_time_unix_secs) —
-- zrodlo autorytatywne, nie szacunek. ended_at = start + dlugosc.
--
-- Rollback: voice-backfill-duration-20260811-rollback.sql (zeruje z powrotem
-- WYLACZNIE te wiersze, ktore ten plik zmienil).
-- ============================================================================

BEGIN;

UPDATE voice_calls SET duration_seconds = 116, ended_at = '2026-08-04T23:41:54+00:00', started_at = coalesce(started_at,'2026-08-04T23:39:58+00:00') WHERE elevenlabs_conversation_id = 'conv_9901kz7jbw75fmjsg9gvgjvcd9x3';
UPDATE voice_calls SET duration_seconds = 95, ended_at = '2026-08-05T00:06:15+00:00', started_at = coalesce(started_at,'2026-08-05T00:04:40+00:00') WHERE elevenlabs_conversation_id = 'conv_8501kz7ks42ze1hva18zp5d13srn';
UPDATE voice_calls SET duration_seconds = 117, ended_at = '2026-08-05T15:56:23+00:00', started_at = coalesce(started_at,'2026-08-05T15:54:26+00:00') WHERE elevenlabs_conversation_id = 'conv_0401kz9a45vbfddtb1w0qy2gngkh';
UPDATE voice_calls SET duration_seconds = 95, ended_at = '2026-08-05T21:39:27+00:00', started_at = coalesce(started_at,'2026-08-05T21:37:52+00:00') WHERE elevenlabs_conversation_id = 'conv_7801kz9xs1bpfxpvfabp7wh84q8w';
UPDATE voice_calls SET duration_seconds = 112, ended_at = '2026-08-05T16:39:39+00:00', started_at = coalesce(started_at,'2026-08-05T16:37:47+00:00') WHERE elevenlabs_conversation_id = 'conv_2501kz9ckhttf4s9v3n8dm28ckxf';
UPDATE voice_calls SET duration_seconds = 90, ended_at = '2026-08-05T21:59:04+00:00', started_at = coalesce(started_at,'2026-08-05T21:57:34+00:00') WHERE elevenlabs_conversation_id = 'conv_0301kz9yx3kzeembvz7ajn6qr4zf';
UPDATE voice_calls SET duration_seconds = 88, ended_at = '2026-08-05T17:43:27+00:00', started_at = coalesce(started_at,'2026-08-05T17:41:59+00:00') WHERE elevenlabs_conversation_id = 'conv_9201kz9g93ywejz9n2cxzewbtvjp';
UPDATE voice_calls SET duration_seconds = 76, ended_at = '2026-08-05T23:56:12+00:00', started_at = coalesce(started_at,'2026-08-05T23:54:56+00:00') WHERE elevenlabs_conversation_id = 'conv_0501kza5m07xfm59hg6vxkrwbway';
UPDATE voice_calls SET duration_seconds = 125, ended_at = '2026-08-05T18:25:31+00:00', started_at = coalesce(started_at,'2026-08-05T18:23:26+00:00') WHERE elevenlabs_conversation_id = 'conv_4901kz9jn04rea3tsjah7k4aj25d';
UPDATE voice_calls SET duration_seconds = 107, ended_at = '2026-08-05T22:28:41+00:00', started_at = coalesce(started_at,'2026-08-05T22:26:54+00:00') WHERE elevenlabs_conversation_id = 'conv_8701kza0jshre5br0vqw9be06mnr';
UPDATE voice_calls SET duration_seconds = 111, ended_at = '2026-08-05T20:42:47+00:00', started_at = coalesce(started_at,'2026-08-05T20:40:56+00:00') WHERE elevenlabs_conversation_id = 'conv_0901kz9tgrw2egr8nageam2phqn5';
UPDATE voice_calls SET duration_seconds = 90, ended_at = '2026-08-05T22:43:09+00:00', started_at = coalesce(started_at,'2026-08-05T22:41:39+00:00') WHERE elevenlabs_conversation_id = 'conv_0601kza1dt1zfmsvc144z3jn7g3h';
UPDATE voice_calls SET duration_seconds = 83, ended_at = '2026-08-06T07:20:41+00:00', started_at = coalesce(started_at,'2026-08-06T07:19:18+00:00') WHERE elevenlabs_conversation_id = 'conv_6901kzaz1n9efaz9wgjta11sbtx7';
UPDATE voice_calls SET duration_seconds = 84, ended_at = '2026-08-06T12:28:17+00:00', started_at = coalesce(started_at,'2026-08-06T12:26:53+00:00') WHERE elevenlabs_conversation_id = 'conv_5501kzbgmv1rfr7tpfnjtqe7ncw9';
UPDATE voice_calls SET duration_seconds = 40, ended_at = '2026-08-06T10:12:50+00:00', started_at = coalesce(started_at,'2026-08-06T10:12:10+00:00') WHERE elevenlabs_conversation_id = 'conv_2901kzb8y6mzfshsg0pzsmpm56w2';
UPDATE voice_calls SET duration_seconds = 74, ended_at = '2026-08-06T12:35:10+00:00', started_at = coalesce(started_at,'2026-08-06T12:33:56+00:00') WHERE elevenlabs_conversation_id = 'conv_7501kzbh1s9yepmaes7f12ms5em6';
UPDATE voice_calls SET duration_seconds = 17, ended_at = '2026-08-06T12:33:25+00:00', started_at = coalesce(started_at,'2026-08-06T12:33:08+00:00') WHERE elevenlabs_conversation_id = 'conv_3301kzbh0aj2fw78v7ng1pesgkaa';
UPDATE voice_calls SET duration_seconds = 315, ended_at = '2026-08-06T12:42:55+00:00', started_at = coalesce(started_at,'2026-08-06T12:37:40+00:00') WHERE elevenlabs_conversation_id = 'conv_5501kzbh8m5jerqt47tgbj6t2qmm';
UPDATE voice_calls SET duration_seconds = 47, ended_at = '2026-08-06T12:30:59+00:00', started_at = coalesce(started_at,'2026-08-06T12:30:12+00:00') WHERE elevenlabs_conversation_id = 'conv_1301kzbgtyqcfd58tcqtqrgbn9cy';
UPDATE voice_calls SET duration_seconds = 180, ended_at = '2026-08-06T12:34:29+00:00', started_at = coalesce(started_at,'2026-08-06T12:31:29+00:00') WHERE elevenlabs_conversation_id = 'conv_5301kzbgx9dhe86tpwc7wfck4m3h';
UPDATE voice_calls SET duration_seconds = 229, ended_at = '2026-08-06T12:48:39+00:00', started_at = coalesce(started_at,'2026-08-06T12:44:50+00:00') WHERE elevenlabs_conversation_id = 'conv_4901kzbhnqpyec1b8986me0bhctj';
UPDATE voice_calls SET duration_seconds = 11, ended_at = '2026-08-06T12:29:33+00:00', started_at = coalesce(started_at,'2026-08-06T12:29:22+00:00') WHERE elevenlabs_conversation_id = 'conv_3201kzbgsd29fr7bwc1c6r803n3e';
UPDATE voice_calls SET duration_seconds = 12, ended_at = '2026-08-06T14:34:48+00:00', started_at = coalesce(started_at,'2026-08-06T14:34:36+00:00') WHERE elevenlabs_conversation_id = 'conv_5301kzbqypx7fpxsafnbr6c14bzp';

COMMIT;

-- KONTROLA: select count(*) from voice_calls where coalesce(duration_seconds,0)=0
--           and elevenlabs_conversation_id is not null;  -- ma zostac 0 (rozmowy nieznane w ElevenLabs)

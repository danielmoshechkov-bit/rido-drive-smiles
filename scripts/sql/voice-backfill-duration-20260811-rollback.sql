-- ROLLBACK voice-backfill-duration-20260811.sql
BEGIN;

UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_9901kz7jbw75fmjsg9gvgjvcd9x3';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_8501kz7ks42ze1hva18zp5d13srn';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_0401kz9a45vbfddtb1w0qy2gngkh';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_7801kz9xs1bpfxpvfabp7wh84q8w';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_2501kz9ckhttf4s9v3n8dm28ckxf';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_0301kz9yx3kzeembvz7ajn6qr4zf';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_9201kz9g93ywejz9n2cxzewbtvjp';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_0501kza5m07xfm59hg6vxkrwbway';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_4901kz9jn04rea3tsjah7k4aj25d';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_8701kza0jshre5br0vqw9be06mnr';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_0901kz9tgrw2egr8nageam2phqn5';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_0601kza1dt1zfmsvc144z3jn7g3h';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_6901kzaz1n9efaz9wgjta11sbtx7';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_5501kzbgmv1rfr7tpfnjtqe7ncw9';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_2901kzb8y6mzfshsg0pzsmpm56w2';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_7501kzbh1s9yepmaes7f12ms5em6';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_3301kzbh0aj2fw78v7ng1pesgkaa';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_5501kzbh8m5jerqt47tgbj6t2qmm';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_1301kzbgtyqcfd58tcqtqrgbn9cy';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_5301kzbgx9dhe86tpwc7wfck4m3h';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_4901kzbhnqpyec1b8986me0bhctj';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_3201kzbgsd29fr7bwc1c6r803n3e';
UPDATE voice_calls SET duration_seconds = NULL, ended_at = NULL WHERE elevenlabs_conversation_id = 'conv_5301kzbqypx7fpxsafnbr6c14bzp';

COMMIT;

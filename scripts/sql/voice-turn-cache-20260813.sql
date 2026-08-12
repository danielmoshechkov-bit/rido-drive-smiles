-- ============================================================================
-- voice-turn-cache-20260813.sql   — DO ZATWIERDZENIA
--
-- CACHE ODPOWIEDZI NA TURĘ. Nie odrzucanie żądań — ODTWARZANIE odpowiedzi.
--
-- PROBLEM (zmierzony, rozmowa 12.08 23:41):
--   22 żądania na 10 tur, 7 tur z duplikatem, jedna tura z CZTEREMA żądaniami.
--   ElevenLabs skleja odpowiedzi z równoległych żądań w jedną wiadomość:
--     original_message = "Do zobaczenia w czwartek o dziesiątej. Dziękuję!Dobrze rozumiem. "
--                                                              ^^^ brak spacji = dwie odpowiedzi
--   Klient słyszy dwa strumienie naraz. To jest „seplenienie" zgłaszane od tygodnia.
--   end_call został wywołany SZEŚĆ RAZY, pierwszy raz nieudanie.
--
-- ROZWIĄZANIE: drugie i kolejne żądanie z tym samym (conversation_id + hash
-- ostatniej wypowiedzi klienta) dostaje IDENTYCZNĄ odpowiedź co pierwsze —
-- ten sam tekst i to samo wywołanie narzędzia.
-- Najgorszy przypadek: klient słyszy to samo zdanie dwa razy zamiast plątaniny.
--
-- KOSZT — ZMIERZONY, nie szacowany:
--   jedno okrążenie do bazy z edge function: mediana 9 ms, max 18 ms (n=22)
--   mediana tury: 940 ms
--   odczyt + zapis = ~18 ms = 1,9% tury
--   Dla porównania: `config`, który usuwaliśmy z tury, kosztował 140-506 ms.
--   Usuwaliśmy zapytania kosztujące 15-50x więcej. To nie jest ten sam koszt.
--
-- DLACZEGO NIE CACHE W PAMIĘCI: zmierzone 40 unikalnych izolatów w 10 minut,
-- a w tej rozmowie każde z czterech żądań jednej tury trafiło na inny izolat.
-- Cache procesowy dałby 0% trafień.
--
-- TTL 30 s: duplikaty przychodzą 1-3 s po pierwszym żądaniu (zmierzone).
-- Trzydzieści sekund to zapas rzędu wielkości.
--
-- Rollback: voice-turn-cache-20260813-rollback.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.voice_turn_cache (
  conversation_id text        NOT NULL,
  user_hash       text        NOT NULL,
  -- Pełna odpowiedź: tekst + wywołania narzędzi klienta. Zapisujemy DOPIERO
  -- po zakończeniu strumienia — żądanie porzucone w połowie nie może trafić
  -- do cache'u jako „gotowa" odpowiedź.
  odpowiedz       jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_hash)
);

-- Do sprzątania po TTL.
CREATE INDEX IF NOT EXISTS voice_turn_cache_created_idx
  ON public.voice_turn_cache (created_at);

-- Tylko service_role. Ta tabela nie ma prawa być widoczna dla klienta —
-- zawiera treść wypowiedzi agenta.
ALTER TABLE public.voice_turn_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_turn_cache FROM anon, authenticated;

-- Sprzątanie co 10 minut. Wpisy żyją 30 s, ale kasujemy z zapasem,
-- żeby tabela nie rosła jak cron.job_run_details.
SELECT cron.schedule(
  'voice-turn-cache-prune',
  '*/10 * * * *',
  $$ DELETE FROM public.voice_turn_cache WHERE created_at < now() - interval '5 minutes' $$
);

-- KONTROLA: SELECT count(*) FROM public.voice_turn_cache;  -- ma być bliskie zeru

-- ============================================================================
-- NALICZENIE WSTECZNE 10 ROZMÓW OD 22.08.2026
--
-- Powód: `voice-call-postprocess` naliczał minuty PRZED `voice-call-analyze`,
-- a to analyze dopisuje wierszowi `elevenlabs_conversation_id` i
-- `duration_seconds`. Dziewięć rozmów nie zostało naliczonych w ogóle (wiersza
-- nie dało się znaleźć), jedna (55 s) dostała 0 minut i znacznik, który zamknął
-- ją na zawsze. Kolejność w funkcji jest już naprawiona i wdrożona.
--
-- Tu prostujemy przeszłość: zdejmujemy znacznik z rozmowy naliczonej na zero
-- i puszczamy `voice_nalicz_minuty` po wszystkich rozmowach bez naliczenia.
-- Funkcja jest idempotentna (warunek `minutes_charged_at IS NULL` siedzi
-- w UPDATE), więc powtórzenie skryptu niczego nie naliczy drugi raz.
-- ============================================================================

BEGIN;

-- 1. Rozmowa naliczona na 0 minut mimo 55 sekund — zdejmujemy znacznik.
UPDATE public.voice_calls
   SET minutes_charged_at = NULL,
       minutes_charged    = NULL
 WHERE minutes_charged = 0
   AND COALESCE(duration_seconds, 0) > 0
   AND created_at >= '2026-08-22';

-- 2. Naliczenie po wszystkich rozmowach bez znacznika.
SELECT vc.created_at::date AS dzien,
       vc.duration_seconds,
       public.voice_nalicz_minuty(vc.id)::text AS wynik
  FROM public.voice_calls vc
 WHERE vc.created_at >= '2026-08-22'
   AND vc.minutes_charged_at IS NULL
 ORDER BY vc.created_at;

COMMIT;

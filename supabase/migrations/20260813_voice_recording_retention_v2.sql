-- Nagranie idzie za zleceniem, a nie za kalendarzem.
--
-- Pierwsza wersja zasad trzymała nagranie rozmowy bez zlecenia przez 180 dni.
-- To był mój błąd co do tego, jak system działa: rozmowa, która nie skończyła
-- się umówieniem, i tak POJAWIA SIĘ jako zlecenie „Wymaga uwagi". Warsztat je
-- przegląda i kasuje, gdy sprawa okazuje się niebyła — i wtedy nagranie ma
-- zniknąć razem z nim, a nie leżeć jeszcze pół roku bez powodu.
--
-- Widać to w danych: z 73 rozmów tylko 3 mają żywe zlecenie, a 29 wskazuje na
-- zlecenie, które ktoś już usunął. To one są typowym przypadkiem, nie wyjątkiem.
--
-- Nowe zasady, w kolejności rozstrzygania:
--   1. zlecenie usunięte      -> nagranie znika przy najbliższym sprzątaniu,
--   2. zlecenie zakończone    -> nagranie żyje jeszcze `keep_days_after_order`,
--   3. zlecenie otwarte       -> nagranie zostaje (sprawa w toku), z zabezpieczeniem
--                                `keep_days_hard_cap` na zlecenia, które nigdy
--                                nie zostaną domknięte,
--   4. rozmowa bez zlecenia   -> krótkie okno `keep_days_no_order`; nie ma czego
--                                pilnować, bo nie ma sprawy.

ALTER TABLE public.voice_recording_retention
  ADD COLUMN IF NOT EXISTS keep_days_no_order  int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS keep_days_hard_cap  int NOT NULL DEFAULT 365;

-- `keep_days_max` z pierwszej wersji zastąpiły dwa osobne okresy powyżej:
-- jeden dla rozmów bez zlecenia, drugi jako zabezpieczenie zleceń otwartych.
-- Jedna liczba dla obu przypadków oznaczała, że skrócenie jej do rozsądnych
-- 30 dni kasowałoby nagrania spraw NADAL W TOKU.
ALTER TABLE public.voice_recording_retention DROP COLUMN IF EXISTS keep_days_max;

ALTER TABLE public.voice_recording_retention DROP CONSTRAINT IF EXISTS vrr_sensowne_okresy;
ALTER TABLE public.voice_recording_retention ADD CONSTRAINT vrr_sensowne_okresy
  CHECK (keep_days_after_order BETWEEN 1 AND 3650
     AND keep_days_no_order    BETWEEN 1 AND 3650
     AND keep_days_hard_cap    BETWEEN 1 AND 3650);

DROP FUNCTION IF EXISTS public.voice_recordings_expired(int);

CREATE OR REPLACE FUNCTION public.voice_recordings_expired(p_limit int DEFAULT 500)
RETURNS TABLE (call_id uuid, provider_id uuid, recording_path text, powod text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT c.id, c.provider_id, c.recording_path, c.created_at,
           c.linked_entity_id, c.linked_entity_type,
           o.id AS zlecenie_id, o.completed_at,
           COALESCE(u.keep_days_after_order, 90) AS po_zakonczeniu,
           COALESCE(u.keep_days_no_order, 30)    AS bez_zlecenia,
           COALESCE(u.keep_days_hard_cap, 365)   AS twardy_limit
    FROM public.voice_calls c
    LEFT JOIN public.workshop_orders o
           ON c.linked_entity_type = 'workshop_order' AND o.id = c.linked_entity_id
    LEFT JOIN public.voice_recording_retention u ON u.provider_id = c.provider_id
    WHERE c.recording_path IS NOT NULL
  )
  SELECT id, provider_id, recording_path,
         CASE
           WHEN linked_entity_id IS NOT NULL AND zlecenie_id IS NULL THEN 'zlecenie usuniete'
           WHEN completed_at IS NOT NULL THEN 'zlecenie zakonczone ' || po_zakonczeniu || ' dni temu'
           WHEN linked_entity_id IS NULL  THEN 'rozmowa bez zlecenia starsza niz ' || bez_zlecenia || ' dni'
           ELSE 'zlecenie otwarte dluzej niz ' || twardy_limit || ' dni'
         END
  FROM r
  WHERE
    -- 1. zlecenie usunięte przez warsztat — nagranie nie ma już czego dotyczyć
    (linked_entity_id IS NOT NULL AND zlecenie_id IS NULL)
    -- 2. zlecenie zakończone dawno temu
    OR (completed_at IS NOT NULL AND completed_at < now() - make_interval(days => po_zakonczeniu))
    -- 3. rozmowa, która nigdy nie stała się zleceniem
    OR (linked_entity_id IS NULL AND created_at < now() - make_interval(days => bez_zlecenia))
    -- 4. zabezpieczenie: zlecenie otwarte w nieskończoność
    OR (zlecenie_id IS NOT NULL AND completed_at IS NULL
        AND created_at < now() - make_interval(days => twardy_limit))
  ORDER BY created_at
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.voice_recordings_expired(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.voice_recordings_expired(int) TO service_role;

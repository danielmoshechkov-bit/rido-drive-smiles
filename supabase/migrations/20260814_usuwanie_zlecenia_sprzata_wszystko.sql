-- Usunięcie zlecenia sprząta po sobie od razu.
--
-- Trzy sprawy naraz, wszystkie z jednego zgłoszenia: „jak usunięte, znaczy
-- zbędne — więc usuwamy".
--
-- 1. NIE DA SIĘ USUNĄĆ ZLECENIA O NIETYPOWYM NUMERZE.
--    Wyzwalacz odtwarzający numerację czytał drugi człon numeru jako miesiąc
--    i rzutował go na liczbę. Numer spoza wzorca „ZLP-08/2026-002" (wpisany
--    ręcznie albo zaimportowany) wywracał całe kasowanie błędem
--    „invalid input syntax for type integer". Zlecenia nie dało się usunąć
--    w ogóle. Teraz człon jest sprawdzany wzorcem PRZED rzutowaniem, a numer
--    spoza wzorca po prostu nie rusza licznika — bo i tak nie był z niego wzięty.
--
-- 2. DZIENNIK SMS I HISTORIA PRZYDZIAŁÓW ZOSTAWAŁY PO ZLECENIU.
--    Nie miały klucza obcego, więc nic ich nie sprzątało: 147 wpisów SMS
--    i 5 wpisów historii wskazywało na zlecenia, których nie ma.
--
--    ŚWIADOMY WYJĄTEK: faktury (user_invoices) NIE są kasowane razem ze
--    zleceniem. Wystawiony dokument księgowy musi zostać, nawet gdy zlecenie
--    okazało się zbędne — to jedyna rzecz z tej listy, której usunięcie byłoby
--    realną szkodą. Dwie takie faktury wskazują dziś na usunięte zlecenia.
--
-- 3. ROZMOWA TELEFONICZNA MIAŁA ZNIKAĆ NATYCHMIAST, NIE NASTĘPNEJ NOCY.
--    Wiersz rozmowy kasuje teraz wyzwalacz, w tej samej chwili co zlecenie.
--    Plik nagrania leży w koszyku, do którego baza nie sięga, więc jego ścieżka
--    trafia do kolejki — sprząta ją funkcja voice-recordings-cleanup, wołana
--    od razu po usunięciu zlecenia (a w razie czego i tak co noc).

-- ── 1. Numeracja nie blokuje kasowania ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workshop_order_sync_sequence_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_srodek text;
  v_month int;
  v_year int;
  v_max int;
BEGIN
  IF OLD.order_number IS NULL OR position('-' in OLD.order_number) = 0 THEN
    RETURN OLD;
  END IF;

  v_kind := SPLIT_PART(OLD.order_number, '-', 1);
  v_srodek := SPLIT_PART(OLD.order_number, '-', 2);

  -- Środek musi wyglądać jak „08/2026". Cokolwiek innego znaczy, że numer nie
  -- pochodzi z naszego licznika — wtedy nie ma czego odtwarzać i, co ważniejsze,
  -- nie wolno przez to przewrócić kasowania.
  IF v_srodek !~ '^[0-9]{1,2}/[0-9]{4}$' THEN
    RETURN OLD;
  END IF;

  v_month := SPLIT_PART(v_srodek, '/', 1)::int;
  v_year  := SPLIT_PART(v_srodek, '/', 2)::int;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(SPLIT_PART(order_number, '-', 3), '\D', '', 'g'), '')::int), 0)
    INTO v_max
  FROM public.workshop_orders
  WHERE provider_id = OLD.provider_id
    AND order_number LIKE v_kind || '-' || LPAD(v_month::text, 2, '0') || '/' || v_year::text || '-%';

  UPDATE public.workshop_order_sequences
     SET last_number = v_max
   WHERE provider_id = OLD.provider_id
     AND year = v_year AND month = v_month AND kind = v_kind;

  RETURN OLD;
END;
$$;

-- ── 2. Dziennik SMS i historia przydziałów znikają ze zleceniem ─────────────
DELETE FROM public.workshop_sms_log s
 WHERE s.order_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.id = s.order_id);

DELETE FROM public.workshop_order_assignment_history h
 WHERE h.order_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.id = h.order_id);

ALTER TABLE public.workshop_sms_log DROP CONSTRAINT IF EXISTS workshop_sms_log_order_id_fkey;
ALTER TABLE public.workshop_sms_log
  ADD CONSTRAINT workshop_sms_log_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.workshop_orders(id) ON DELETE CASCADE;

ALTER TABLE public.workshop_order_assignment_history DROP CONSTRAINT IF EXISTS woah_order_id_fkey;
ALTER TABLE public.workshop_order_assignment_history
  ADD CONSTRAINT woah_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.workshop_orders(id) ON DELETE CASCADE;

-- ── 3. Rozmowa znika natychmiast, plik nagrania trafia do kolejki ───────────
CREATE TABLE IF NOT EXISTS public.voice_recordings_purge_queue (
  id          bigserial PRIMARY KEY,
  provider_id uuid,
  path        text NOT NULL,
  queued_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_recordings_purge_queue ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.voice_recordings_purge_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.voice_recordings_purge_queue_id_seq TO service_role;
COMMENT ON TABLE public.voice_recordings_purge_queue IS
  'Ścieżki nagrań do skasowania z koszyka. Baza nie sięga do koszyka, robi to voice-recordings-cleanup.';

CREATE OR REPLACE FUNCTION public.workshop_order_purge_voice_calls()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.voice_recordings_purge_queue (provider_id, path)
  SELECT c.provider_id, c.recording_path
    FROM public.voice_calls c
   WHERE c.linked_entity_type = 'workshop_order'
     AND c.linked_entity_id = OLD.id
     AND c.recording_path IS NOT NULL;

  -- Rozmowy agenta tekstowego wskazują na rozmowę bez kasowania kaskadowego.
  UPDATE public.ai_agent_conversations SET call_id = NULL
   WHERE call_id IN (SELECT id FROM public.voice_calls
                      WHERE linked_entity_type = 'workshop_order' AND linked_entity_id = OLD.id);

  -- Transkrypcje i wyniki znikają kaskadowo razem z rozmową.
  DELETE FROM public.voice_calls
   WHERE linked_entity_type = 'workshop_order' AND linked_entity_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_workshop_order_purge_voice ON public.workshop_orders;
CREATE TRIGGER trg_workshop_order_purge_voice
AFTER DELETE ON public.workshop_orders
FOR EACH ROW EXECUTE FUNCTION public.workshop_order_purge_voice_calls();

-- ── 4. Nagrania: 30 dni od zakończenia zlecenia ────────────────────────────
ALTER TABLE public.voice_recording_retention ALTER COLUMN keep_days_after_order SET DEFAULT 30;
UPDATE public.voice_recording_retention SET keep_days_after_order = 30 WHERE keep_days_after_order = 90;

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
           COALESCE(u.keep_days_after_order, 30) AS po_zakonczeniu,
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
  WHERE (linked_entity_id IS NOT NULL AND zlecenie_id IS NULL)
     OR (completed_at IS NOT NULL AND completed_at < now() - make_interval(days => po_zakonczeniu))
     OR (linked_entity_id IS NULL AND created_at < now() - make_interval(days => bez_zlecenia))
     OR (zlecenie_id IS NOT NULL AND completed_at IS NULL
         AND created_at < now() - make_interval(days => twardy_limit))
  ORDER BY created_at
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.voice_recordings_expired(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.voice_recordings_expired(int) TO service_role;

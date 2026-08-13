-- Usunięte zlecenie zabiera ze sobą rozmowę.
--
-- Do tej pory po skasowaniu zlecenia zostawał wiersz rozmowy z transkrypcją,
-- wynikiem i wnioskami — wskazujący na coś, czego już nie ma. W bazie takich
-- rozmów jest 29 przy 3 żywych zleceniach, więc to nie margines. Nie da się do
-- nich dotrzeć z żadnego ekranu (karta rozmowy otwiera się ze zlecenia), więc
-- leżą wyłącznie po to, żeby leżeć.
--
-- Kolejność ma znaczenie: NAJPIERW sprzątanie kasuje plik audio z koszyka
-- (voice-recordings-cleanup), DOPIERO POTEM znika wiersz. Odwrotnie plik
-- zostałby w koszyku na zawsze — bez wiersza nikt by już nie wiedział,
-- że tam jest. Dlatego warunek `recording_path IS NULL`.
--
-- Kasujemy tylko rozmowy wskazujące na NIEISTNIEJĄCE zlecenie. Rozmowa bez
-- zlecenia (nigdy nie powiązana) zostaje — to materiał do przejrzenia,
-- a nie sierota.

CREATE OR REPLACE FUNCTION public.voice_calls_purge_orphans(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_ile int;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT c.id
    FROM public.voice_calls c
    WHERE c.linked_entity_type = 'workshop_order'
      AND c.linked_entity_id IS NOT NULL
      AND c.recording_path IS NULL          -- plik audio już usunięty z koszyka
      AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.id = c.linked_entity_id)
    ORDER BY c.created_at
    LIMIT GREATEST(p_limit, 1)
  ) s;

  IF v_ids IS NULL THEN RETURN 0; END IF;

  -- Rozmowy agenta tekstowego wskazują na wiersz rozmowy bez kasowania kaskadowego.
  -- Zwalniamy powiązanie, zamiast pozwolić, żeby jedno takie wskazanie
  -- zablokowało całe sprzątanie.
  UPDATE public.ai_agent_conversations SET call_id = NULL WHERE call_id = ANY(v_ids);

  -- voice_transcripts i voice_call_outcomes znikają kaskadowo (sprawdzone w FK).
  DELETE FROM public.voice_calls WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_ile = ROW_COUNT;
  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.voice_calls_purge_orphans(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_calls_purge_orphans(int) TO service_role;

-- Licznik dla trybu dry_run: ile rozmów czeka na skasowanie. Osobna funkcja,
-- bo warunku „zlecenie nie istnieje" nie da się wyrazić przez zwykłe zapytanie
-- z API, a liczba przybliżona byłaby myląca.
CREATE OR REPLACE FUNCTION public.voice_calls_orphans_count()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.voice_calls c
  WHERE c.linked_entity_type = 'workshop_order'
    AND c.linked_entity_id IS NOT NULL
    AND c.recording_path IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.id = c.linked_entity_id);
$$;

REVOKE ALL ON FUNCTION public.voice_calls_orphans_count() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_calls_orphans_count() TO service_role;

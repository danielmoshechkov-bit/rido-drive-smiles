-- ============================================================================
-- voice-commit-idempotencja-po-istnieniu-20260813.sql   — DO ZATWIERDZENIA
--
-- IDEMPOTENCJA MA SIĘ OPIERAĆ NA ISTNIENIU SKUTKU, NIE NA ZNACZNIKU.
--
-- Dziś RPC sprawdza tylko, czy `voice_calls.linked_entity_id` jest ustawiony:
--     IF v_existing IS NOT NULL THEN RETURN 'duplicate'
-- Nie sprawdza, czy wskazywane zlecenie ISTNIEJE.
--
-- Stan faktyczny (13.08): 25 rozmów ze wskaźnikiem, z czego WISZĄCYCH 25.
-- Każde zlecenie utworzone przez agenta zostało skasowane z panelu, a wskaźniki
-- zostały. Ponowne uruchomienie commitu zwraca „duplicate" i NIE odtwarza niczego.
--
-- To przekreśla zasadę „rozmowa jest bytem pierwotnym": transkrypty są, dane są,
-- a mimo to nie da się odtworzyć zlecenia, bo znacznik kłamie.
--
-- PO ZMIANIE: `duplicate` zwracamy tylko wtedy, gdy zlecenie NAPRAWDĘ istnieje.
-- Wiszący wskaźnik jest czyszczony i commit przechodzi dalej, tworząc zlecenie
-- od nowa — dokładnie tak, jak zaprojektowaliśmy odtwarzanie.
--
-- Rollback: voice-commit-idempotencja-po-istnieniu-20260813-rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.voice_commit_call(
  p_conversation_id text, p_provider_id uuid,
  p_first_name text, p_last_name text, p_phone text,
  p_brand text, p_model text, p_plate text,
  p_complaint text, p_date date, p_time time,
  p_duration_min int DEFAULT 60, p_needs_review boolean DEFAULT false,
  p_review_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_zrodlo text;
BEGIN
  -- Wiszący wskaźnik = zlecenie skasowane. Czyścimy go, żeby dalsza część
  -- funkcji (bez zmian) potraktowała rozmowę jak niezapisaną.
  UPDATE voice_calls vc
     SET linked_entity_id = NULL, linked_entity_type = NULL
   WHERE vc.provider_id = p_provider_id
     AND vc.elevenlabs_conversation_id = p_conversation_id
     AND vc.linked_entity_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM workshop_orders o WHERE o.id = vc.linked_entity_id);

  -- Reszta logiki bez zmian — wywołujemy oryginał pod nową nazwą.
  RETURN public.voice_commit_call_core(
    p_conversation_id, p_provider_id, p_first_name, p_last_name, p_phone,
    p_brand, p_model, p_plate, p_complaint, p_date, p_time,
    p_duration_min, p_needs_review, p_review_reason);
END;
$fn$;

-- UWAGA: ten plik zakłada, że oryginalne ciało zostało wcześniej przemianowane
-- na voice_commit_call_core. Krok przygotowawczy (do wykonania RAZ, ręcznie,
-- po obejrzeniu):
--   ALTER FUNCTION public.voice_commit_call(text,uuid,text,text,text,text,text,
--     text,text,date,time,int,boolean,text) RENAME TO voice_commit_call_core;
-- Dopiero potem CREATE OR REPLACE powyżej.

REVOKE ALL ON FUNCTION public.voice_commit_call(text,uuid,text,text,text,text,text,text,text,date,time,int,boolean,text) FROM anon, authenticated;

-- KONTROLA:
--   SELECT count(*) FROM voice_calls vc
--     LEFT JOIN workshop_orders o ON o.id = vc.linked_entity_id
--    WHERE vc.linked_entity_id IS NOT NULL AND o.id IS NULL;   -- po odtworzeniu: 0

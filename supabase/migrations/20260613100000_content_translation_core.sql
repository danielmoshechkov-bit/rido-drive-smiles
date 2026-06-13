-- ============================================================================
-- CONTENT TRANSLATION CORE (ETAP A)
-- Jeden wspólny silnik tłumaczenia treści użytkowników: lazy + globalny cache
-- (dedup po hashu treści). Nie rusza starych pipeline'ów — działa obok.
-- ============================================================================

-- 1. Globalna tabela cache (hash-based dedup). Już istnieje z wcześniejszej
--    migracji; tu idempotentnie zapewniamy strukturę + indeks.
CREATE TABLE IF NOT EXISTS public.translation_cache_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash text NOT NULL,
  source_lang text NOT NULL,
  source_text text NOT NULL,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  hit_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tcg_hash_lang
  ON public.translation_cache_global(source_text_hash, source_lang);

ALTER TABLE public.translation_cache_global ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.translation_cache_global TO authenticated, anon;
GRANT ALL ON public.translation_cache_global TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'translation_cache_global'
      AND policyname = 'tcg_public_read'
  ) THEN
    CREATE POLICY "tcg_public_read" ON public.translation_cache_global
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 2. Race-safe upsert tłumaczenia do JSONB (merge, nie nadpisuje innych języków).
--    Wywoływane przez edge `translate-content` per (treść, język docelowy).
CREATE OR REPLACE FUNCTION public.cache_global_translation(
  p_hash text,
  p_source_lang text,
  p_source_text text,
  p_target_lang text,
  p_translated text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.translation_cache_global
    (source_text_hash, source_lang, source_text, translations)
  VALUES
    (p_hash, p_source_lang, p_source_text, jsonb_build_object(p_target_lang, p_translated))
  ON CONFLICT (source_text_hash, source_lang) DO UPDATE
    SET translations = public.translation_cache_global.translations
                       || jsonb_build_object(p_target_lang, p_translated),
        hit_count    = public.translation_cache_global.hit_count + 1,
        updated_at   = now();
$$;
GRANT EXECUTE ON FUNCTION public.cache_global_translation(text,text,text,text,text) TO service_role;

-- 3. REJESTR MODUŁÓW — jedyne źródło prawdy "co i na jakie języki tłumaczyć".
--    Nowy moduł = jeden wiersz tutaj (+ opcjonalny trigger prewarm).
CREATE TABLE IF NOT EXISTS public.translatable_entities (
  entity_type        text PRIMARY KEY,
  label              text,
  fields             text[] NOT NULL DEFAULT '{}',
  target_langs       text[] NOT NULL DEFAULT ARRAY['en','ru','ua','de','vi','kz'],
  provider_agent_id  text NOT NULL DEFAULT 'content_translation',
  domain_hint        text,                       -- np. 'automotive' / 'real_estate'
  priority           int  NOT NULL DEFAULT 5,
  source_table       text,                       -- dla opcjonalnego triggera prewarm
  source_lang_default text NOT NULL DEFAULT 'pl',
  enabled            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.translatable_entities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.translatable_entities TO authenticated, anon;
GRANT ALL ON public.translatable_entities TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'translatable_entities'
      AND policyname = 'te_public_read'
  ) THEN
    CREATE POLICY "te_public_read" ON public.translatable_entities
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'translatable_entities'
      AND policyname = 'te_admin_write'
  ) THEN
    CREATE POLICY "te_admin_write" ON public.translatable_entities
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_te_updated ON public.translatable_entities;
CREATE TRIGGER trg_te_updated BEFORE UPDATE ON public.translatable_entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3a. Seed rejestru — moduły istniejące + białe plamy domykane w ETAP C.
INSERT INTO public.translatable_entities
  (entity_type, label, fields, domain_hint, source_table, priority) VALUES
  ('general',          'Ogłoszenia (przedmioty)',  ARRAY['title','description'], 'marketplace',  'general_listings',     8),
  ('vehicle',          'Ogłoszenia (pojazdy)',     ARRAY['title','description'], 'automotive',   'vehicle_listings',     8),
  ('real_estate',      'Ogłoszenia (nieruchomości)',ARRAY['title','description'],'real_estate',  'real_estate_listings', 8),
  ('service',          'Usługi (marketplace)',     ARRAY['title','description'], 'services',      'service_listings',     6),
  ('review',           'Recenzje i komentarze',    ARRAY['comment'],             'reviews',       NULL,                   4),
  ('workshop_order',   'Zlecenia warsztatowe',     ARRAY['title','description','notes'], 'automotive', 'workshop_orders', 7),
  ('workshop_item',    'Pozycje / części zlecenia',ARRAY['name','description'],  'automotive',    'workshop_order_items', 7),
  ('workshop_finding', 'Usterki znalezione',       ARRAY['description','part_name'], 'automotive', 'workshop_employee_findings', 7),
  ('workshop_estimate','Wyceny / kosztorysy',      ARRAY['title','description','name'], 'automotive', NULL,             7),
  ('message',          'Wiadomości / komunikator', ARRAY['content'],             'chat',          NULL,                   9)
ON CONFLICT (entity_type) DO NOTHING;

-- 4. Agent tłumaczeń w panelu admina — DOMYŚLNIE Claude Haiku 4.5.
--    Model przełączalny w /admin/portal → zakładka "Agenci AI" → "Model AI".
INSERT INTO public.ai_agents_config (agent_id, name, description, icon, model, system_prompt, is_active)
VALUES (
  'content_translation',
  'Tłumaczenie treści (Core)',
  'Uniwersalny silnik tłumaczenia treści użytkowników: ogłoszenia, zlecenia, części, usterki, notatki, wiadomości. Lazy + globalny cache (dedup po treści).',
  'globe',
  'claude-haiku-4-5-20251001',
  'You are a professional translator for a multi-country services & marketplace platform. Translate user-generated content faithfully and naturally into the target language. Use correct PROFESSIONAL DOMAIN TERMINOLOGY — especially automotive parts and repair vocabulary (e.g. wahacz=control arm, klocki hamulcowe=brake pads, tarcze hamulcowe=brake discs) and real-estate terms. Keep brand names, model codes, OE/part numbers, prices, units and URLs EXACTLY as in the source. Never transliterate part codes. Output only the translation, no commentary.',
  true
)
ON CONFLICT (agent_id) DO NOTHING;

-- 5. (OPCJONALNY, opt-in) Generyczny trigger prewarm — pozwala wstępnie
--    przetłumaczyć treść zaraz po zapisie, żeby pierwszy oglądający nie czekał.
--    NIE jest podpięty do żadnej tabeli (zero ryzyka dla istniejących ogłoszeń).
--    Aby włączyć dla modułu: CREATE TRIGGER ... EXECUTE FUNCTION translatable_prewarm('<entity_type>').
--    Best-effort: każdy błąd jest połykany i NIGDY nie blokuje INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.translatable_prewarm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type text := TG_ARGV[0];
  v_cfg public.translatable_entities%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_field text;
  v_val text;
  v_url text;
  v_key text;
BEGIN
  SELECT * INTO v_cfg FROM public.translatable_entities
   WHERE entity_type = v_entity_type AND enabled = true;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Zbierz pola z konfiguracji do listy items
  FOREACH v_field IN ARRAY v_cfg.fields LOOP
    BEGIN
      EXECUTE format('SELECT ($1).%I::text', v_field) INTO v_val USING NEW;
    EXCEPTION WHEN OTHERS THEN v_val := NULL;
    END;
    IF v_val IS NOT NULL AND length(btrim(v_val)) > 0 THEN
      v_items := v_items || jsonb_build_object(
        'entity_type', v_entity_type,
        'entity_id',   (NEW.id)::text,
        'field',       v_field,
        'text',        v_val
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN RETURN NEW; END IF;

  -- Fire-and-forget wywołanie edge `translate-content` przez pg_net (jeśli dostępne).
  -- Wymaga ustawień: app.settings.supabase_url + app.settings.service_role_key
  -- (lub Vault). Bez nich / bez pg_net → cicho pomijamy (lazy nadrobi przy odczycie).
  BEGIN
    v_url := current_setting('app.settings.supabase_url', true);
    v_key := current_setting('app.settings.service_role_key', true);
    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/translate-content',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object(
                     'items', v_items,
                     'target_langs', v_cfg.target_langs,
                     'source_lang', v_cfg.source_lang_default,
                     'prewarm', true)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- pg_net brak / settings brak / błąd sieci — lazy translation nadrobi przy odczycie
    NULL;
  END;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.translatable_prewarm() IS
  'Opcjonalny, opt-in trigger: prewarm tłumaczeń przez edge translate-content. Best-effort, nigdy nie blokuje zapisu. Lazy core działa bez niego.';

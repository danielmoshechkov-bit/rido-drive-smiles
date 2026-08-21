BEGIN;

-- Analiza to OSOBNY wpis w Centrum AI, bo to inny model i inny koszt.
-- Wywiad prowadzi model tani (Haiku), analize model mocny (Sonnet).
INSERT INTO public.ai_function_mapping
  (function_key, function_name, function_description, category, provider_key,
   backup_provider_key, allow_fallback, is_enabled, sort_order)
VALUES
  ('rido_help_analiza', 'Pomoc RIDO AI — analiza (model mocny)',
   'Jedno glebokie zapytanie po zebraniu wywiadu: szuka w internecie i sklada diagnoze ze zrodlami',
   'Warsztat', 'claude_sonnet', 'claude_haiku', true, true, 7)
ON CONFLICT (function_key) DO UPDATE
  SET function_name = EXCLUDED.function_name,
      function_description = EXCLUDED.function_description,
      category = EXCLUDED.category,
      is_enabled = true;

UPDATE public.ai_function_mapping
   SET function_name = 'Pomoc RIDO AI — wywiad (model tani)',
       function_description = 'Dopytuje mechanika o szczegoly i podpowiada, co sprawdzic, zanim pojdzie analiza'
 WHERE function_key = 'rido_help';

-- Sonnet ma klucz, ale byl wylaczony — bez tego analiza nie ruszy.
UPDATE public.ai_providers SET is_enabled = true
 WHERE provider_key = 'claude_sonnet' AND coalesce(api_key_encrypted,'') <> '';

-- Ile glebokich analiz zmiescilo sie w watku. Trzy to sufit ustalony
-- z warsztatem: wiecej znaczy, ze rozmowa i tak zeszla na manowce.
ALTER TABLE public.warsztat_pomoc_ai
  ADD COLUMN IF NOT EXISTS analizy integer NOT NULL DEFAULT 0;

DO $$
DECLARE v_sonnet boolean;
BEGIN
  SELECT is_enabled INTO v_sonnet FROM public.ai_providers WHERE provider_key='claude_sonnet';
  IF v_sonnet IS NOT TRUE THEN
    RAISE EXCEPTION 'Sonnet nadal wylaczony albo bez klucza — analiza nie ruszy';
  END IF;
  RAISE NOTICE 'Wywiad: Haiku. Analiza: Sonnet. Limit trzech analiz na watek.';
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';

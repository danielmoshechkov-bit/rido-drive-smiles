ALTER TABLE public.service_providers ADD COLUMN IF NOT EXISTS short_name TEXT;

-- Synchronize from workshop_settings where short_name exists
UPDATE public.service_providers sp
SET short_name = ws.short_name
FROM public.workshop_settings ws
WHERE ws.user_id = sp.user_id
  AND ws.short_name IS NOT NULL
  AND ws.short_name <> ''
  AND (sp.short_name IS NULL OR sp.short_name = '');
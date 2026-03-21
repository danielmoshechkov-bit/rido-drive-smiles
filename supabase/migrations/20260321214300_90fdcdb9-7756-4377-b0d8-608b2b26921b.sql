-- Dodaj Claude jeśli nie ma
INSERT INTO public.ai_providers 
  (provider_key, display_name, default_model, is_enabled, timeout_seconds, admin_note)
VALUES
  ('claude_haiku',  'Claude Haiku',  'claude-haiku-4-5-20251001', false, 30, 'Klucz z console.anthropic.com → API Keys'),
  ('claude_sonnet', 'Claude Sonnet', 'claude-sonnet-4-6',         false, 60, 'Klucz z console.anthropic.com → API Keys'),
  ('claude_opus',   'Claude Opus',   'claude-opus-4-6',           false, 90, 'Klucz z console.anthropic.com → API Keys'),
  ('gemini_flash',  'Gemini Flash',  'gemini-3.1-flash-image-preview', false, 60, 'Ten sam klucz co Google Gemini'),
  ('imagen3',       'Nano Banana (Gemini Images)', 'gemini-3.1-flash-image-preview', false, 60, 'Ten sam klucz co Google Gemini')
ON CONFLICT (provider_key) DO NOTHING;

-- Upewnij się że Google Gemini ma właściwy provider_key
-- Sprawdź jaki provider_key ma aktualny rekord Gemini i dodaj alias
INSERT INTO public.ai_providers 
  (provider_key, display_name, default_model, is_enabled, timeout_seconds)
SELECT 
  'gemini',
  'Gemini (alias)',
  default_model,
  is_enabled,
  timeout_seconds
FROM public.ai_providers 
WHERE provider_key IN ('google_gemini', 'Google Gemini', 'gemini_pro')
  AND NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE provider_key = 'gemini')
LIMIT 1;
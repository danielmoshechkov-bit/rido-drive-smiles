-- Dodaj Claude (3 modele)
INSERT INTO public.ai_providers (provider_key, display_name, default_model, is_enabled, timeout_seconds, admin_note)
VALUES
  ('claude_haiku',  'Claude Haiku',  'claude-haiku-4-5-20251001', false, 30, 'Szybki i tani. Główny model do chatu i wycen.'),
  ('claude_sonnet', 'Claude Sonnet', 'claude-sonnet-4-6',         false, 60, 'Złożone zadania, Cowork, analiza dokumentów.'),
  ('claude_opus',   'Claude Opus',   'claude-opus-4-6',           false, 90, 'Tryb Pro, najtrudniejsze zadania.')
ON CONFLICT (provider_key) DO NOTHING;

-- Dodaj Imagen 3 i Gemini Flash (dla grafiki)
INSERT INTO public.ai_providers (provider_key, display_name, default_model, is_enabled, timeout_seconds, admin_note)
VALUES
  ('imagen3',      'Imagen 3 (Grafika)', 'imagen-3.0-generate-001', false, 60, 'Generowanie obrazów. Używa klucza Google Gemini.'),
  ('gemini_flash', 'Gemini Flash',       'gemini-2.0-flash',        false, 30, 'Szybki Gemini. Też do inpaintingu i edycji obrazów.')
ON CONFLICT (provider_key) DO NOTHING;

-- Napraw model Kimi jeśli pusty
UPDATE public.ai_providers SET default_model = 'moonshot-v1-8k' WHERE provider_key = 'kimi' AND (default_model IS NULL OR default_model = '');
UPDATE public.ai_providers SET default_model = 'gemini-2.0-flash' WHERE provider_key IN ('google_gemini','gemini') AND (default_model IS NULL OR default_model = '');
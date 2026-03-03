
-- Table mapping portal features to AI providers
CREATE TABLE IF NOT EXISTS public.ai_function_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_key TEXT NOT NULL UNIQUE,
  function_name TEXT NOT NULL,
  function_description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  provider_key TEXT,
  model_override TEXT,
  is_enabled BOOLEAN DEFAULT true,
  custom_prompt TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_function_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ai_function_mapping"
ON public.ai_function_mapping
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read ai_function_mapping"
ON public.ai_function_mapping
FOR SELECT
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_ai_function_mapping_updated_at
BEFORE UPDATE ON public.ai_function_mapping
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default mappings
INSERT INTO public.ai_function_mapping (function_key, function_name, function_description, category, provider_key, sort_order) VALUES
  ('portal_search', 'Wyszukiwarka portalu', 'Wyszukiwarka AI na stronie głównej i w portalu', 'search', 'kimi', 1),
  ('listing_description', 'Opisy ogłoszeń', 'Generowanie i ulepszanie opisów ogłoszeń', 'text', 'openai', 2),
  ('listing_seo', 'SEO ogłoszeń', 'Generowanie meta-tagów, tytułów SEO', 'text', 'openai', 3),
  ('photo_editing', 'Edycja zdjęć', 'Edycja i ulepszanie zdjęć ogłoszeń', 'image', 'gemini', 4),
  ('logo_generation', 'Generowanie logo', 'Tworzenie logo dla usługodawców', 'image', 'gemini', 5),
  ('website_generation', 'Generowanie stron WWW', 'Tworzenie stron internetowych dla usługodawców', 'text', 'lovable', 6),
  ('website_prompt_builder', 'Budowanie promptu strony', 'Weryfikacja i budowanie promptu dla generatora stron', 'text', 'openai', 7),
  ('voice_navigation', 'Głos nawigacji', 'Synteza mowy dla nawigacji portalu', 'voice', 'elevenlabs', 8),
  ('voice_agent', 'AI Voice Agent', 'Agenci głosowi do obsługi klientów', 'voice', 'elevenlabs', 9),
  ('ai_assistant', 'Asystent AI', 'Ogólny asystent AI portalu', 'text', 'openai', 10),
  ('real_estate_analysis', 'Analiza nieruchomości', 'Analiza atrakcyjności nieruchomości', 'text', 'kimi', 11),
  ('vehicle_analysis', 'Analiza pojazdów', 'Analiza ogłoszeń motoryzacyjnych', 'text', 'kimi', 12),
  ('ocr_documents', 'OCR dokumentów', 'Rozpoznawanie tekstu z dokumentów i faktur', 'image', 'gemini', 13),
  ('ai_sales_agent', 'Agent sprzedażowy', 'AI agent do rozmów sprzedażowych', 'voice', 'elevenlabs', 14)
ON CONFLICT (function_key) DO NOTHING;

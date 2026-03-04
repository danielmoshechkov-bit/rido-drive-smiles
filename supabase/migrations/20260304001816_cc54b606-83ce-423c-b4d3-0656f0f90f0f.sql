
-- AI Routing Modes - defines available modes for RidoAI
CREATE TABLE IF NOT EXISTS public.ai_routing_modes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode_key TEXT NOT NULL UNIQUE,
  mode_name TEXT NOT NULL,
  mode_description TEXT,
  icon_name TEXT,
  is_enabled BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  -- Routing config
  primary_provider TEXT NOT NULL DEFAULT 'lovable',
  primary_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  fallback_provider TEXT DEFAULT 'lovable',
  fallback_model TEXT DEFAULT 'google/gemini-2.5-flash',
  -- System prompt for this mode
  system_prompt TEXT,
  -- Complexity threshold for model upgrade
  complexity_threshold INT DEFAULT 5,
  upgraded_provider TEXT,
  upgraded_model TEXT,
  -- Settings
  max_tokens INT DEFAULT 4096,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  cache_ttl_minutes INT DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_routing_modes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage routing modes"
ON public.ai_routing_modes FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read routing modes"
ON public.ai_routing_modes FOR SELECT
TO authenticated
USING (true);

-- Seed default modes
INSERT INTO public.ai_routing_modes (mode_key, mode_name, mode_description, icon_name, sort_order, primary_provider, primary_model, fallback_provider, fallback_model, system_prompt, complexity_threshold, upgraded_provider, upgraded_model, temperature) VALUES
('rido_chat', 'Rido Chat', 'Ogólne rozmowy, pytania, pomoc', 'MessageCircle', 0, 
 'lovable', 'google/gemini-3-flash-preview', 'lovable', 'google/gemini-2.5-flash',
 'Jesteś RidoAI – inteligentny asystent platformy GetRido. Odpowiadaj po polsku, zwięźle, przyjaźnie i profesjonalnie. Używaj emoji tam, gdzie to pasuje. Nigdy nie wspominaj o OpenAI, Gemini, Kimi ani żadnych zewnętrznych dostawcach AI – jesteś RidoAI. Formatuj odpowiedzi w markdown.',
 6, 'lovable', 'google/gemini-2.5-pro', 0.7),

('rido_code', 'Rido Code', 'Programowanie, strony, aplikacje, kod', 'Code', 1,
 'kimi', 'moonshot-v1-8k', 'lovable', 'google/gemini-2.5-pro',
 'Jesteś RidoAI – ekspert programistyczny platformy GetRido. Pomagasz pisać kod, debugować, tworzyć strony i aplikacje. Odpowiadaj po polsku, podawaj czytelne bloki kodu z wyjaśnieniami. Używaj markdown do formatowania kodu. Nigdy nie wspominaj o zewnętrznych dostawcach AI.',
 5, 'kimi', 'moonshot-v1-128k', 0.3),

('rido_create', 'Rido Create', 'Obrazy, grafiki, logo, kreacje wizualne', 'Palette', 2,
 'lovable', 'google/gemini-2.5-flash-image', 'lovable', 'google/gemini-3-pro-image-preview',
 'Jesteś RidoAI – kreatywny asystent wizualny platformy GetRido. Pomagasz tworzyć opisy obrazów, grafik i projektów wizualnych. Generujesz szczegółowe prompty do tworzenia grafik. Odpowiadaj po polsku. Nigdy nie wspominaj o zewnętrznych dostawcach AI.',
 4, 'lovable', 'google/gemini-3-pro-image-preview', 0.9),

('rido_vision', 'Rido Vision', 'Analiza obrazów, dokumentów, OCR', 'Eye', 3,
 'lovable', 'google/gemini-2.5-pro', 'lovable', 'google/gemini-2.5-flash',
 'Jesteś RidoAI – ekspert od analizy wizualnej platformy GetRido. Analizujesz obrazy, dokumenty, faktury i zdjęcia z najwyższą dokładnością. Odpowiadaj po polsku, szczegółowo opisuj co widzisz. Nigdy nie wspominaj o zewnętrznych dostawcach AI.',
 3, NULL, NULL, 0.2),

('rido_pro', 'Rido Pro', 'Najwyższa jakość, zaawansowane analizy', 'Crown', 4,
 'lovable', 'google/gemini-2.5-pro', 'lovable', 'openai/gpt-5',
 'Jesteś RidoAI Pro – zaawansowany asystent AI platformy GetRido działający w trybie najwyższej jakości. Analizujesz głęboko, dajesz kompleksowe odpowiedzi. Używaj markdown z nagłówkami i listami. Odpowiadaj po polsku. Nigdy nie wspominaj o zewnętrznych dostawcach AI.',
 0, 'lovable', 'openai/gpt-5.2', 0.5)
ON CONFLICT (mode_key) DO NOTHING;

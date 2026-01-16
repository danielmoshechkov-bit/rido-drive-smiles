-- AI System Central - rozszerzenie ustawień AI

-- Rozszerzenie tabeli ai_settings o nowe kolumny dla dwóch silników AI
ALTER TABLE ai_settings 
ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS gemini_api_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS ai_search_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ai_seo_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ai_photo_enabled BOOLEAN DEFAULT true;

-- Rozszerzenie tabeli ai_credit_history o dodatkowe dane
ALTER TABLE ai_credit_history
ADD COLUMN IF NOT EXISTS ai_type TEXT,
ADD COLUMN IF NOT EXISTS model_used TEXT,
ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;

-- Tabela dla SEO - real_estate_listings
ALTER TABLE real_estate_listings
ADD COLUMN IF NOT EXISTS seo_title TEXT,
ADD COLUMN IF NOT EXISTS seo_description TEXT,
ADD COLUMN IF NOT EXISTS seo_h1 TEXT,
ADD COLUMN IF NOT EXISTS seo_schema_json JSONB,
ADD COLUMN IF NOT EXISTS photo_alts TEXT[];

-- Tabela dla SEO - vehicle_listings
ALTER TABLE vehicle_listings
ADD COLUMN IF NOT EXISTS seo_title TEXT,
ADD COLUMN IF NOT EXISTS seo_description TEXT,
ADD COLUMN IF NOT EXISTS seo_h1 TEXT,
ADD COLUMN IF NOT EXISTS seo_schema_json JSONB,
ADD COLUMN IF NOT EXISTS photo_alts TEXT[];

-- Tabela historii edycji zdjęć AI
CREATE TABLE IF NOT EXISTS ai_photo_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('vehicle', 'real_estate')),
  listing_id UUID NOT NULL,
  photo_index INTEGER NOT NULL DEFAULT 0,
  original_url TEXT NOT NULL,
  edited_url TEXT NOT NULL,
  instruction TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy dla ai_photo_edits
CREATE INDEX IF NOT EXISTS idx_ai_photo_edits_listing ON ai_photo_edits(listing_type, listing_id);
CREATE INDEX IF NOT EXISTS idx_ai_photo_edits_created_at ON ai_photo_edits(created_at DESC);

-- Enable RLS
ALTER TABLE ai_photo_edits ENABLE ROW LEVEL SECURITY;

-- Policy - użytkownicy mogą widzieć swoje edycje
CREATE POLICY "Users can view their own photo edits"
ON ai_photo_edits FOR SELECT
USING (auth.uid() = created_by);

-- Policy - użytkownicy mogą tworzyć edycje
CREATE POLICY "Users can create photo edits"
ON ai_photo_edits FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Policy - admini mają pełen dostęp
CREATE POLICY "Admins have full access to photo edits"
ON ai_photo_edits FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Komentarze dokumentacyjne
COMMENT ON COLUMN ai_settings.openai_api_key_encrypted IS 'Zaszyfrowany klucz API OpenAI (GPT-5.2) dla wyszukiwarki i SEO';
COMMENT ON COLUMN ai_settings.gemini_api_key_encrypted IS 'Zaszyfrowany klucz API Gemini dla edycji zdjęć';
COMMENT ON COLUMN ai_settings.ai_search_enabled IS 'Czy wyszukiwarka AI jest włączona';
COMMENT ON COLUMN ai_settings.ai_seo_enabled IS 'Czy automatyczne SEO jest włączone';
COMMENT ON COLUMN ai_settings.ai_photo_enabled IS 'Czy edycja zdjęć AI jest włączona';
COMMENT ON TABLE ai_photo_edits IS 'Historia edycji zdjęć przez AI (Gemini)';
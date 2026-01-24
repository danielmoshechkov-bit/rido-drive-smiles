-- Add accountant role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'accountant';

-- Add TTS configuration columns to ai_settings
ALTER TABLE ai_settings 
ADD COLUMN IF NOT EXISTS tts_provider TEXT DEFAULT 'openai',
ADD COLUMN IF NOT EXISTS tts_voice_name TEXT DEFAULT 'alloy',
ADD COLUMN IF NOT EXISTS tts_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS stt_provider TEXT DEFAULT 'openai',
ADD COLUMN IF NOT EXISTS elevenlabs_api_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS google_tts_api_key_encrypted TEXT;

-- Create external_integrations table for GUS/KSeF/Whitelist config
CREATE TABLE IF NOT EXISTS external_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  environment TEXT DEFAULT 'demo' CHECK (environment IN ('demo', 'production')),
  api_key_encrypted TEXT,
  api_url TEXT,
  last_test_at TIMESTAMP WITH TIME ZONE,
  last_test_status TEXT,
  last_test_message TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert default integrations
INSERT INTO external_integrations (service_name, is_enabled, environment, api_url, config) VALUES
('gus_regon', false, 'demo', 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc', '{"description": "GUS REGON - dane firm"}'),
('mf_whitelist', true, 'production', 'https://wl-api.mf.gov.pl/api/search/nip', '{"description": "Biała lista VAT - weryfikacja NIP"}'),
('ksef', false, 'demo', 'https://ksef-demo.mf.gov.pl/api', '{"description": "Krajowy System e-Faktur"}')
ON CONFLICT (service_name) DO NOTHING;

-- Enable RLS
ALTER TABLE external_integrations ENABLE ROW LEVEL SECURITY;

-- Allow admins to read/write external_integrations
CREATE POLICY "Admins can manage external integrations"
ON external_integrations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Add voice cache statistics view helper
CREATE OR REPLACE FUNCTION get_voice_cache_stats()
RETURNS TABLE (
  total_phrases BIGINT,
  total_size_bytes BIGINT,
  estimated_savings_pln NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COALESCE(SUM(LENGTH(audio_url))::BIGINT, 0),
    (COUNT(*) * 0.015)::NUMERIC -- avg TTS cost per phrase
  FROM voice_phrase_cache;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
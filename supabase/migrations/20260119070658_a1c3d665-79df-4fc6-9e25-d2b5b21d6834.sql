-- =====================================================
-- Rozbudowa tabeli vehicle_listings o nowe pola (Otomoto-style)
-- =====================================================

-- Dane identyfikacyjne pojazdu
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS vin TEXT;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS vin_reveals_count INTEGER DEFAULT 0;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS first_registration_date DATE;

-- Stan pojazdu
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS is_damaged BOOLEAN DEFAULT false;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS is_imported BOOLEAN DEFAULT false;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS country_origin TEXT;

-- Dane techniczne
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS transmission TEXT; -- manual, automatic
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS equipment JSONB DEFAULT '{}';
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS doors_count INTEGER;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS seats_count INTEGER;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS color_type TEXT; -- metallic, matte, pearl

-- Weryfikacja i statusy
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS insurance_valid BOOLEAN DEFAULT false;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS inspection_valid BOOLEAN DEFAULT false;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS insurance_expiry DATE;
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS inspection_expiry DATE;

-- Zdjęcia AI
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS ai_enhanced_photos TEXT[];
ALTER TABLE vehicle_listings ADD COLUMN IF NOT EXISTS has_ai_photos BOOLEAN DEFAULT false;

-- =====================================================
-- Tabela kredytów użytkowników (dla funkcji AI)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  credits_balance INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own credits"
  ON user_credits FOR UPDATE
  USING (auth.uid() = user_id);

-- =====================================================
-- Cennik funkcji AI
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT UNIQUE NOT NULL,
  credits_per_use INTEGER DEFAULT 10,
  description TEXT,
  description_en TEXT,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_pricing ENABLE ROW LEVEL SECURITY;

-- Public read, admin write
CREATE POLICY "Anyone can view AI pricing"
  ON ai_pricing FOR SELECT
  USING (true);

-- Insert default AI pricing
INSERT INTO ai_pricing (feature_key, credits_per_use, description, is_enabled)
VALUES 
  ('vehicle_photo_enhance', 10, 'Ulepszenie zdjęcia pojazdu przez AI (tło studyjne)', true),
  ('vehicle_photo_custom', 15, 'Niestandardowa edycja zdjęcia z własnym opisem', true),
  ('listing_ai_description', 5, 'Generowanie opisu ogłoszenia przez AI', true),
  ('listing_ai_seo', 8, 'Optymalizacja SEO ogłoszenia przez AI', true)
ON CONFLICT (feature_key) DO NOTHING;

-- =====================================================
-- Feature toggles dla giełdy pojazdów
-- =====================================================
INSERT INTO feature_toggles (feature_key, feature_name, description, category, is_enabled)
VALUES 
  ('vehicle_marketplace_services_enabled', 'Usługi w giełdzie', 'Czy kategoria usług jest włączona w giełdzie', 'marketplace', false),
  ('vehicle_marketplace_free_listing_enabled', 'Darmowe ogłoszenia', 'Czy darmowe publikowanie ogłoszeń jest włączone', 'marketplace', true),
  ('vehicle_marketplace_free_listing_days', 'Dni darmowego ogłoszenia', 'Ile dni ogłoszenie jest wyświetlane za darmo', 'marketplace', true),
  ('vehicle_marketplace_ai_photo_enabled', 'AI edycja zdjęć', 'Czy funkcja AI edycji zdjęć jest włączona', 'marketplace', true),
  ('fleet_registration_enabled', 'Rejestracja floty', 'Czy samodzielna rejestracja floty jest włączona', 'fleet', true)
ON CONFLICT (feature_key) DO NOTHING;

-- =====================================================
-- Rozszerzenie marketplace_user_profiles o dane firmowe
-- =====================================================
ALTER TABLE marketplace_user_profiles ADD COLUMN IF NOT EXISTS company_nip TEXT;
ALTER TABLE marketplace_user_profiles ADD COLUMN IF NOT EXISTS company_address TEXT;
ALTER TABLE marketplace_user_profiles ADD COLUMN IF NOT EXISTS company_city TEXT;
ALTER TABLE marketplace_user_profiles ADD COLUMN IF NOT EXISTS company_postal_code TEXT;
ALTER TABLE marketplace_user_profiles ADD COLUMN IF NOT EXISTS company_contact_person TEXT;
ALTER TABLE marketplace_user_profiles ADD COLUMN IF NOT EXISTS company_contact_phone TEXT;

-- =====================================================
-- Trigger dla updated_at na user_credits
-- =====================================================
CREATE OR REPLACE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_ai_pricing_updated_at
  BEFORE UPDATE ON ai_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
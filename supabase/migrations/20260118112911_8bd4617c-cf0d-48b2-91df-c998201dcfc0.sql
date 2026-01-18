-- GetRido Maps: Navigation Settings + Voice Catalog (Fixed)

-- 1. User navigation settings (per user preferences)
CREATE TABLE IF NOT EXISTS map_navigation_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_enabled BOOLEAN DEFAULT true,
  voice_language TEXT DEFAULT 'pl',
  voice_style TEXT DEFAULT 'system',
  voice_volume INTEGER DEFAULT 80 CHECK (voice_volume >= 0 AND voice_volume <= 100),
  voice_rate NUMERIC(3,2) DEFAULT 1.0 CHECK (voice_rate >= 0.5 AND voice_rate <= 2.0),
  speed_warning_yellow_over INTEGER DEFAULT 9,
  speed_warning_red_over INTEGER DEFAULT 15,
  show_speed_limit BOOLEAN DEFAULT true,
  show_lane_guidance BOOLEAN DEFAULT true,
  show_roundabout_exit BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE map_navigation_settings ENABLE ROW LEVEL SECURITY;

-- Users can view/update their own settings
CREATE POLICY "Users can view own nav settings" ON map_navigation_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own nav settings" ON map_navigation_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own nav settings" ON map_navigation_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin can manage all (using correct enum value 'admin')
CREATE POLICY "Admin full access to nav settings" ON map_navigation_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Trigger for updated_at
CREATE TRIGGER update_map_nav_settings_updated_at
  BEFORE UPDATE ON map_navigation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Voice catalog (admin-managed)
CREATE TABLE IF NOT EXISTS map_voice_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT DEFAULT 'browser_tts',
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE map_voice_catalog ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view active voices
CREATE POLICY "Authenticated can view active voices" ON map_voice_catalog
  FOR SELECT USING (is_active = true);

-- Admin can manage
CREATE POLICY "Admin can manage voice catalog" ON map_voice_catalog
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Insert default voices
INSERT INTO map_voice_catalog (code, language, name, provider, is_active) VALUES
  ('system_pl', 'pl', 'System (Polski)', 'browser_tts', true),
  ('system_en', 'en', 'System (English)', 'browser_tts', true),
  ('system_ru', 'ru', 'System (Русский)', 'browser_tts', true),
  ('system_uk', 'uk', 'System (Українська)', 'browser_tts', true)
ON CONFLICT (code) DO NOTHING;

-- 3. Add navigation_defaults to maps_config if not exists
INSERT INTO maps_config (config_key, config_value) VALUES
  ('navigation_defaults', '{"voice_enabled":true,"voice_language":"pl","speed_warning_yellow_over":9,"speed_warning_red_over":15,"show_speed_limit":true,"show_lane_guidance":true,"show_roundabout_exit":true}')
ON CONFLICT (config_key) DO NOTHING;
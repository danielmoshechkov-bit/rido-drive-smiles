
CREATE TABLE IF NOT EXISTS ui_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang_code text NOT NULL,
  section text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  translated_at timestamptz DEFAULT now(),
  model_used text DEFAULT 'kimi',
  UNIQUE(lang_code, section, key)
);

ALTER TABLE ui_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_ui_translations"
  ON ui_translations FOR SELECT USING (true);

CREATE POLICY "service_write_ui_translations"
  ON ui_translations FOR ALL USING (true);

CREATE INDEX idx_ui_trans_lang 
  ON ui_translations(lang_code, section);

-- Also create listing_translations table for caching listing translations
CREATE TABLE IF NOT EXISTS listing_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'general',
  target_lang text NOT NULL,
  title_translated text NOT NULL,
  description_translated text,
  source_lang text DEFAULT 'pl',
  translated_by text DEFAULT 'kimi',
  translated_at timestamptz DEFAULT now(),
  UNIQUE(listing_id, listing_type, target_lang)
);

ALTER TABLE listing_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_listing_translations"
  ON listing_translations FOR SELECT USING (true);

CREATE POLICY "service_write_listing_translations"
  ON listing_translations FOR ALL USING (true);

CREATE INDEX idx_listing_trans_lookup
  ON listing_translations(listing_id, target_lang);

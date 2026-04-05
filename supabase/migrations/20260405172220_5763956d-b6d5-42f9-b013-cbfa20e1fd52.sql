-- General listing categories
CREATE TABLE IF NOT EXISTS general_listing_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  parent_id uuid REFERENCES general_listing_categories(id),
  auto_created boolean DEFAULT false,
  listings_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE general_listing_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read categories" ON general_listing_categories FOR SELECT USING (true);
CREATE POLICY "Auth users can insert categories" ON general_listing_categories FOR INSERT TO authenticated WITH CHECK (true);

-- General listings
CREATE TABLE IF NOT EXISTS general_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  price numeric(10,2),
  price_negotiable boolean DEFAULT false,
  category_id uuid REFERENCES general_listing_categories(id),
  condition text CHECK (condition IN ('nowy','jak_nowy','dobry','dostateczny','do_naprawy')),
  location text,
  ai_score numeric(3,1),
  ai_tips jsonb,
  ai_price_min numeric(10,2),
  ai_price_max numeric(10,2),
  status text DEFAULT 'active' CHECK (status IN ('active','sold','archived','draft')),
  views_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE general_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active listings" ON general_listings FOR SELECT USING (status = 'active' OR user_id = auth.uid());
CREATE POLICY "Users can insert own listings" ON general_listings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own listings" ON general_listings FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own listings" ON general_listings FOR DELETE TO authenticated USING (user_id = auth.uid());

-- General listing photos
CREATE TABLE IF NOT EXISTS general_listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES general_listings(id) ON DELETE CASCADE NOT NULL,
  url text NOT NULL,
  is_ai_enhanced boolean DEFAULT false,
  is_protected boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE general_listing_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read listing photos" ON general_listing_photos FOR SELECT USING (true);
CREATE POLICY "Users can insert photos for own listings" ON general_listing_photos FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM general_listings WHERE id = listing_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete photos for own listings" ON general_listing_photos FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM general_listings WHERE id = listing_id AND user_id = auth.uid())
);

-- Seed default categories
INSERT INTO general_listing_categories (name, slug) VALUES
  ('Elektronika', 'elektronika'),
  ('Moda i odzież', 'moda'),
  ('Dom i ogród', 'dom-ogrod'),
  ('Sport i hobby', 'sport-hobby'),
  ('Motoryzacja (akcesoria)', 'motoryzacja-akcesoria'),
  ('Dziecko i mama', 'dziecko'),
  ('Zwierzęta', 'zwierzeta'),
  ('Książki i edukacja', 'ksiazki'),
  ('Usługi', 'uslugi'),
  ('Inne', 'inne')
ON CONFLICT (slug) DO NOTHING;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read listing photos storage" ON storage.objects FOR SELECT USING (bucket_id = 'listing-photos');
CREATE POLICY "Auth users can upload listing photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'listing-photos');
CREATE POLICY "Auth users can delete own listing photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'listing-photos');

-- Updated at trigger
CREATE TRIGGER set_general_listings_updated_at BEFORE UPDATE ON general_listings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
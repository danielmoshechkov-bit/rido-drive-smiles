-- =============================================
-- RIDO Universal Marketplace Schema
-- =============================================

-- 1. Główne kategorie marketplace (pojazdy, usługi, mini-market)
CREATE TABLE public.marketplace_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Typy produktów w kategorii (osobowe, motocykle, manicure, owoce)
CREATE TABLE public.marketplace_item_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.marketplace_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(category_id, slug)
);

-- 3. Typy transakcji (wynajem, sprzedaż, cesja)
CREATE TABLE public.marketplace_transaction_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Uniwersalne ogłoszenia
CREATE TABLE public.marketplace_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.marketplace_categories(id),
  item_type_id UUID NOT NULL REFERENCES public.marketplace_item_types(id),
  transaction_type_id UUID NOT NULL REFERENCES public.marketplace_transaction_types(id),
  
  -- Powiązania z istniejącymi tabelami
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  
  -- Podstawowe dane ogłoszenia
  title TEXT NOT NULL,
  description TEXT,
  
  -- Cennik
  price NUMERIC NOT NULL DEFAULT 0,
  price_type TEXT DEFAULT 'weekly', -- weekly, monthly, daily, one_time, per_hour
  price_negotiable BOOLEAN DEFAULT false,
  
  -- Lokalizacja
  city_id UUID REFERENCES public.cities(id),
  location_text TEXT,
  
  -- Kontakt
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  
  -- Media
  photos TEXT[] DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- active, pending, sold, expired
  
  -- Statystyki
  views_count INTEGER DEFAULT 0,
  favorites_count INTEGER DEFAULT 0,
  
  -- Metadane
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '30 days')
);

-- 5. Definicje atrybutów dla każdego typu (admin konfiguruje)
CREATE TABLE public.marketplace_attribute_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_type_id UUID NOT NULL REFERENCES public.marketplace_item_types(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  label TEXT NOT NULL,
  label_en TEXT,
  input_type TEXT DEFAULT 'text', -- text, number, select, multiselect, range, boolean
  options JSONB DEFAULT '[]', -- dla select/multiselect
  placeholder TEXT,
  unit TEXT, -- km, PLN, l, etc.
  is_required BOOLEAN DEFAULT false,
  is_filterable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(item_type_id, attribute_key)
);

-- 6. Atrybuty specyficzne ogłoszenia
CREATE TABLE public.marketplace_listing_attributes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  attribute_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(listing_id, attribute_key)
);

-- 7. Ulubione ogłoszenia użytkowników
CREATE TABLE public.marketplace_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

-- 8. Zapisane wyszukiwania
CREATE TABLE public.marketplace_saved_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.marketplace_categories(id),
  item_type_id UUID REFERENCES public.marketplace_item_types(id),
  transaction_type_ids UUID[] DEFAULT '{}',
  filters JSONB DEFAULT '{}',
  notify_new_listings BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- Enable RLS
-- =============================================

ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listing_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_saved_searches ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies
-- =============================================

-- Categories - public read, admin manage
CREATE POLICY "Anyone can view active categories" ON public.marketplace_categories
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage categories" ON public.marketplace_categories
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Item Types - public read, admin manage
CREATE POLICY "Anyone can view active item types" ON public.marketplace_item_types
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage item types" ON public.marketplace_item_types
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Transaction Types - public read, admin manage
CREATE POLICY "Anyone can view active transaction types" ON public.marketplace_transaction_types
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage transaction types" ON public.marketplace_transaction_types
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Listings - public read active, owner/admin manage
CREATE POLICY "Anyone can view active listings" ON public.marketplace_listings
  FOR SELECT USING (is_active = true AND status = 'active');
CREATE POLICY "Users can manage own listings" ON public.marketplace_listings
  FOR ALL USING (created_by = auth.uid() OR fleet_id = get_user_fleet_id(auth.uid()));
CREATE POLICY "Admins can manage all listings" ON public.marketplace_listings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Attribute Definitions - public read, admin manage
CREATE POLICY "Anyone can view attribute definitions" ON public.marketplace_attribute_definitions
  FOR SELECT USING (true);
CREATE POLICY "Admins can manage attribute definitions" ON public.marketplace_attribute_definitions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Listing Attributes - inherit from listing
CREATE POLICY "Anyone can view listing attributes" ON public.marketplace_listing_attributes
  FOR SELECT USING (true);
CREATE POLICY "Users can manage own listing attributes" ON public.marketplace_listing_attributes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings ml 
      WHERE ml.id = listing_id 
      AND (ml.created_by = auth.uid() OR ml.fleet_id = get_user_fleet_id(auth.uid()))
    )
  );

-- Favorites - user owns
CREATE POLICY "Users can manage own favorites" ON public.marketplace_favorites
  FOR ALL USING (user_id = auth.uid());

-- Saved Searches - user owns
CREATE POLICY "Users can manage own saved searches" ON public.marketplace_saved_searches
  FOR ALL USING (user_id = auth.uid());

-- =============================================
-- Initial Data - Categories
-- =============================================

INSERT INTO public.marketplace_categories (name, slug, icon, description, sort_order) VALUES
('Pojazdy', 'pojazdy', 'Car', 'Samochody, motocykle, skutery i rowery', 1),
('Usługi', 'uslugi', 'Briefcase', 'Usługi profesjonalne i osobiste', 2),
('Mini-market', 'mini-market', 'ShoppingBasket', 'Jedzenie, owoce, warzywa z dostawą', 3);

-- =============================================
-- Initial Data - Item Types (Vehicles)
-- =============================================

INSERT INTO public.marketplace_item_types (category_id, name, slug, icon, sort_order)
SELECT c.id, t.name, t.slug, t.icon, t.sort_order
FROM public.marketplace_categories c
CROSS JOIN (VALUES 
  ('Osobowe', 'osobowe', 'Car', 1),
  ('Motocykle', 'motocykle', 'Bike', 2),
  ('Skutery', 'skutery', 'Zap', 3),
  ('Rowery', 'rowery', 'Bike', 4),
  ('Dostawcze', 'dostawcze', 'Truck', 5)
) AS t(name, slug, icon, sort_order)
WHERE c.slug = 'pojazdy';

-- =============================================
-- Initial Data - Transaction Types
-- =============================================

INSERT INTO public.marketplace_transaction_types (name, slug, icon, description, color, sort_order) VALUES
('Wynajem', 'wynajem', 'Key', 'Krótko i długoterminowy wynajem pojazdu', '#3b82f6', 1),
('Wynajem z wykupem', 'rent-to-own', 'TrendingUp', 'Rent to Own - wynajem z opcją wykupu', '#8b5cf6', 2),
('Sprzedaż', 'sprzedaz', 'DollarSign', 'Sprzedaż pojazdu', '#10b981', 3),
('Cesja leasingu', 'cesja-leasingu', 'FileText', 'Przejęcie umowy leasingowej', '#f59e0b', 4),
('Zamiana', 'zamiana', 'ArrowLeftRight', 'Zamiana pojazdu na inny', '#ec4899', 5),
('Po flocie / taxi', 'po-flocie', 'Car', 'Pojazdy po flotach i taxi', '#6366f1', 6),
('Pakiety flotowe', 'pakiety-flotowe', 'Package', 'Zestawy pojazdów dla firm', '#14b8a6', 7),
('Inwestycyjne', 'inwestycyjne', 'PiggyBank', 'Pojazdy jako inwestycja', '#f97316', 8);

-- =============================================
-- Initial Data - Attribute Definitions for Cars
-- =============================================

INSERT INTO public.marketplace_attribute_definitions (item_type_id, attribute_key, label, input_type, options, unit, is_required, is_filterable, sort_order)
SELECT it.id, a.attribute_key, a.label, a.input_type, a.options::jsonb, a.unit, a.is_required, a.is_filterable, a.sort_order
FROM public.marketplace_item_types it
CROSS JOIN (VALUES 
  ('brand', 'Marka', 'select', '[]', NULL, true, true, 1),
  ('model', 'Model', 'text', '[]', NULL, true, true, 2),
  ('year', 'Rok produkcji', 'number', '[]', NULL, true, true, 3),
  ('mileage', 'Przebieg', 'number', '[]', 'km', false, true, 4),
  ('fuel_type', 'Rodzaj paliwa', 'select', '["Benzyna", "Diesel", "Hybryda", "Elektryczny", "LPG"]', NULL, false, true, 5),
  ('transmission', 'Skrzynia biegów', 'select', '["Manualna", "Automatyczna"]', NULL, false, true, 6),
  ('engine_capacity', 'Pojemność silnika', 'number', '[]', 'cm³', false, true, 7),
  ('power', 'Moc', 'number', '[]', 'KM', false, true, 8),
  ('color', 'Kolor', 'text', '[]', NULL, false, true, 9),
  ('doors', 'Liczba drzwi', 'select', '["2", "3", "4", "5"]', NULL, false, true, 10),
  ('seats', 'Liczba miejsc', 'select', '["2", "4", "5", "7", "9"]', NULL, false, true, 11),
  ('vin', 'VIN', 'text', '[]', NULL, false, false, 12)
) AS a(attribute_key, label, input_type, options, unit, is_required, is_filterable, sort_order)
WHERE it.slug = 'osobowe';

-- Attributes for motorcycles
INSERT INTO public.marketplace_attribute_definitions (item_type_id, attribute_key, label, input_type, options, unit, is_required, is_filterable, sort_order)
SELECT it.id, a.attribute_key, a.label, a.input_type, a.options::jsonb, a.unit, a.is_required, a.is_filterable, a.sort_order
FROM public.marketplace_item_types it
CROSS JOIN (VALUES 
  ('brand', 'Marka', 'select', '[]', NULL, true, true, 1),
  ('model', 'Model', 'text', '[]', NULL, true, true, 2),
  ('year', 'Rok produkcji', 'number', '[]', NULL, true, true, 3),
  ('mileage', 'Przebieg', 'number', '[]', 'km', false, true, 4),
  ('engine_capacity', 'Pojemność silnika', 'number', '[]', 'cm³', false, true, 5),
  ('power', 'Moc', 'number', '[]', 'KM', false, true, 6),
  ('type', 'Typ', 'select', '["Sportowy", "Naked", "Cruiser", "Enduro", "Chopper", "Turystyczny"]', NULL, false, true, 7)
) AS a(attribute_key, label, input_type, options, unit, is_required, is_filterable, sort_order)
WHERE it.slug = 'motocykle';

-- Indexes for performance
CREATE INDEX idx_marketplace_listings_category ON public.marketplace_listings(category_id);
CREATE INDEX idx_marketplace_listings_item_type ON public.marketplace_listings(item_type_id);
CREATE INDEX idx_marketplace_listings_transaction ON public.marketplace_listings(transaction_type_id);
CREATE INDEX idx_marketplace_listings_city ON public.marketplace_listings(city_id);
CREATE INDEX idx_marketplace_listings_status ON public.marketplace_listings(status, is_active);
CREATE INDEX idx_marketplace_listings_created ON public.marketplace_listings(created_at DESC);
CREATE INDEX idx_marketplace_listing_attrs ON public.marketplace_listing_attributes(listing_id, attribute_key);
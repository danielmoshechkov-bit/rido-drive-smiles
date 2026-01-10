-- Create real_estate_agents table
CREATE TABLE public.real_estate_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Company data
  company_name TEXT NOT NULL,
  company_nip TEXT NOT NULL,
  company_regon TEXT,
  company_address TEXT NOT NULL,
  company_city TEXT NOT NULL,
  company_postal_code TEXT,
  
  -- Owner
  owner_first_name TEXT NOT NULL,
  owner_last_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  
  -- Guardian (optional)
  guardian_first_name TEXT,
  guardian_last_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  
  -- Agency hierarchy
  parent_agent_id UUID REFERENCES public.real_estate_agents(id),
  
  -- Status and limits
  status TEXT DEFAULT 'pending',
  active_listings_count INTEGER DEFAULT 0,
  max_employees INTEGER DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create real_estate_listings table
CREATE TABLE public.real_estate_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.real_estate_agents(id) ON DELETE CASCADE,
  
  -- Basic data
  title TEXT NOT NULL,
  description TEXT,
  property_type TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  price_type TEXT DEFAULT 'total',
  
  -- Location
  location TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL,
  district TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Parameters
  price DECIMAL(12, 2) NOT NULL,
  price_per_sqm DECIMAL(10, 2),
  area DECIMAL(10, 2),
  rooms INTEGER,
  floor INTEGER,
  total_floors INTEGER,
  build_year INTEGER,
  
  -- Amenities
  has_balcony BOOLEAN DEFAULT FALSE,
  has_elevator BOOLEAN DEFAULT FALSE,
  has_parking BOOLEAN DEFAULT FALSE,
  has_garden BOOLEAN DEFAULT FALSE,
  
  -- Media
  photos TEXT[] DEFAULT '{}',
  
  -- Uniqueness
  property_unique_id TEXT,
  listing_number TEXT UNIQUE,
  
  -- Contact info (optional override)
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  
  -- Status
  status TEXT DEFAULT 'active',
  views INTEGER DEFAULT 0,
  favorites_count INTEGER DEFAULT 0,
  rating DECIMAL(2, 1),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.real_estate_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_estate_listings ENABLE ROW LEVEL SECURITY;

-- Policies for real_estate_agents
CREATE POLICY "Users can view own agent profile"
  ON public.real_estate_agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent profile"
  ON public.real_estate_agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent profile"
  ON public.real_estate_agents FOR UPDATE
  USING (auth.uid() = user_id);

-- Policies for real_estate_listings
CREATE POLICY "Anyone can view active listings"
  ON public.real_estate_listings FOR SELECT
  USING (status = 'active');

CREATE POLICY "Agents can manage own listings"
  ON public.real_estate_listings FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM public.real_estate_agents WHERE user_id = auth.uid()
    )
  );

-- Add test agent for marcinlupierz2@gmail.com
INSERT INTO public.real_estate_agents (
  user_id,
  company_name,
  company_nip,
  company_address,
  company_city,
  company_postal_code,
  owner_first_name,
  owner_last_name,
  owner_phone,
  owner_email,
  status
) 
SELECT 
  id,
  'Testowa Agencja Nieruchomości Sp. z o.o.',
  '1234567890',
  'ul. Marszałkowska 100',
  'Warszawa',
  '00-001',
  'Marcin',
  'Tester',
  '+48 123 456 789',
  'marcinlupierz2@gmail.com',
  'verified'
FROM auth.users 
WHERE email = 'marcinlupierz2@gmail.com'
LIMIT 1;
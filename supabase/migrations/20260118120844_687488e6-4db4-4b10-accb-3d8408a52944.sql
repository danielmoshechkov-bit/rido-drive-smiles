-- =====================================================
-- GetRido Maps: Parking SPP + Toll Segments Tables
-- =====================================================

-- 1. PARKING ZONES (Strefy Płatnego Parkowania)
CREATE TABLE public.parking_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'spp' CHECK (type IN ('spp', 'private')),
  polygon JSONB NOT NULL,
  rules JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.parking_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active parking zones"
ON public.parking_zones FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage parking zones"
ON public.parking_zones FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.drivers d
  WHERE d.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND d.user_role = 'admin'
));

-- 2. USER VEHICLES (Tablice rejestracyjne użytkowników)
CREATE TABLE public.user_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plate TEXT NOT NULL,
  nickname TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vehicles"
ON public.user_vehicles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vehicles"
ON public.user_vehicles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vehicles"
ON public.user_vehicles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vehicles"
ON public.user_vehicles FOR DELETE
USING (auth.uid() = user_id);

-- 3. PARKING SESSIONS (Sesje parkingowe)
CREATE TABLE public.parking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vehicle_plate TEXT NOT NULL,
  zone_id UUID REFERENCES public.parking_zones(id),
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended', 'cancelled')),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'simulated')),
  amount NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'PLN',
  provider TEXT,
  provider_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.parking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own parking sessions"
ON public.parking_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own parking sessions"
ON public.parking_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own parking sessions"
ON public.parking_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all parking sessions"
ON public.parking_sessions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.drivers d
  WHERE d.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND d.user_role = 'admin'
));

-- 4. TOLL SEGMENTS (Płatne odcinki/bramki)
CREATE TABLE public.toll_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT DEFAULT 'PL',
  name TEXT NOT NULL,
  type TEXT DEFAULT 'toll_gate' CHECK (type IN ('toll_gate', 'vignette')),
  geometry JSONB NOT NULL,
  price_rules JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.toll_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active toll segments"
ON public.toll_segments FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage toll segments"
ON public.toll_segments FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.drivers d
  WHERE d.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND d.user_role = 'admin'
));

-- 5. TOLL PURCHASES (Zakupy winiet/przepustek)
CREATE TABLE public.toll_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  segment_id UUID REFERENCES public.toll_segments(id),
  start_at TIMESTAMPTZ DEFAULT now(),
  end_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'refunded')),
  amount NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'PLN',
  provider TEXT DEFAULT 'simulated',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.toll_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own toll purchases"
ON public.toll_purchases FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own toll purchases"
ON public.toll_purchases FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_parking_zones_city ON public.parking_zones(city);
CREATE INDEX idx_parking_sessions_user ON public.parking_sessions(user_id);
CREATE INDEX idx_parking_sessions_status ON public.parking_sessions(status);
CREATE INDEX idx_toll_segments_country ON public.toll_segments(country);
CREATE INDEX idx_toll_purchases_user ON public.toll_purchases(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_parking_zones_updated_at
BEFORE UPDATE ON public.parking_zones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_parking_sessions_updated_at
BEFORE UPDATE ON public.parking_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_toll_segments_updated_at
BEFORE UPDATE ON public.toll_segments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
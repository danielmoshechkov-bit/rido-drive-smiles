-- ═══════════════════════════════════════════════════════════════
-- GetRido Maps - Fundament Danych (POI Partners, Reports, Wallet)
-- ═══════════════════════════════════════════════════════════════

-- 1. Partner POI Table (custom/partner locations)
CREATE TABLE IF NOT EXISTS public.map_poi_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('fuel', 'parking', 'ev_charger', 'shop', 'restaurant', 'hotel', 'service', 'custom')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  website TEXT,
  payment_supported BOOLEAN DEFAULT false,
  is_partner BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  logo_url TEXT,
  opening_hours TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Map Reports (community incidents)
CREATE TABLE IF NOT EXISTS public.map_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('police', 'accident', 'traffic', 'roadwork', 'hazard', 'closure', 'speed_cam', 'red_light_cam', 'avg_speed_zone', 'other')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  description TEXT,
  direction_deg INTEGER CHECK (direction_deg >= 0 AND direction_deg < 360),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  votes_up INTEGER DEFAULT 0,
  votes_down INTEGER DEFAULT 0
);

-- 3. Map Report Votes
CREATE TABLE IF NOT EXISTS public.map_report_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES public.map_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(report_id, user_id)
);

-- 4. Static Hazards (radars, cameras - admin-managed)
CREATE TABLE IF NOT EXISTS public.map_static_hazards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('speed_cam', 'red_light_cam', 'avg_speed_zone_start', 'avg_speed_zone_end')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  direction_deg INTEGER CHECK (direction_deg >= 0 AND direction_deg < 360),
  speed_limit INTEGER,
  description TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. User Wallets (GetRido points)
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  balance INTEGER DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Wallet Transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'payment', 'refund', 'bonus')),
  description TEXT,
  reference_type TEXT, -- 'parking', 'toll', 'ev_charging', etc.
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. POI Favorites
CREATE TABLE IF NOT EXISTS public.map_poi_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  poi_type TEXT NOT NULL CHECK (poi_type IN ('partner', 'osm')),
  poi_id TEXT NOT NULL, -- UUID for partner, OSM ID for osm
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, poi_type, poi_id)
);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════

-- map_poi_partners: public read, admin write
ALTER TABLE public.map_poi_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active partner POIs" 
  ON public.map_poi_partners FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Admins can manage partner POIs" 
  ON public.map_poi_partners FOR ALL 
  USING (has_role(auth.uid(), 'admin'));

-- map_reports: users can insert, see approved + own, admins see all
ALTER TABLE public.map_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" 
  ON public.map_reports FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can see approved reports or own" 
  ON public.map_reports FOR SELECT 
  USING (status = 'approved' OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reports" 
  ON public.map_reports FOR UPDATE 
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete reports" 
  ON public.map_reports FOR DELETE 
  USING (has_role(auth.uid(), 'admin'));

-- map_report_votes: users can vote once per report
ALTER TABLE public.map_report_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can vote on reports" 
  ON public.map_report_votes FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can see votes" 
  ON public.map_report_votes FOR SELECT 
  USING (true);

CREATE POLICY "Users can update own votes" 
  ON public.map_report_votes FOR UPDATE 
  USING (auth.uid() = user_id);

-- map_static_hazards: public read, admin write
ALTER TABLE public.map_static_hazards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active hazards" 
  ON public.map_static_hazards FOR SELECT 
  USING (is_active = true);

CREATE POLICY "Admins can manage hazards" 
  ON public.map_static_hazards FOR ALL 
  USING (has_role(auth.uid(), 'admin'));

-- user_wallets: users can see own
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" 
  ON public.user_wallets FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can create wallets" 
  ON public.user_wallets FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage wallets" 
  ON public.user_wallets FOR ALL 
  USING (has_role(auth.uid(), 'admin'));

-- wallet_transactions: users can see own
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" 
  ON public.wallet_transactions FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_wallets 
      WHERE id = wallet_transactions.wallet_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage transactions" 
  ON public.wallet_transactions FOR ALL 
  USING (has_role(auth.uid(), 'admin'));

-- map_poi_favorites: users manage own
ALTER TABLE public.map_poi_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites" 
  ON public.map_poi_favorites FOR ALL 
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- Indexes for performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_map_poi_partners_location ON public.map_poi_partners(lat, lng);
CREATE INDEX IF NOT EXISTS idx_map_poi_partners_category ON public.map_poi_partners(category);
CREATE INDEX IF NOT EXISTS idx_map_reports_location ON public.map_reports(lat, lng);
CREATE INDEX IF NOT EXISTS idx_map_reports_status ON public.map_reports(status);
CREATE INDEX IF NOT EXISTS idx_map_reports_expires ON public.map_reports(expires_at);
CREATE INDEX IF NOT EXISTS idx_map_static_hazards_location ON public.map_static_hazards(lat, lng);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);

-- ═══════════════════════════════════════════════════════════════
-- Updated_at triggers
-- ═══════════════════════════════════════════════════════════════

CREATE TRIGGER update_map_poi_partners_updated_at
  BEFORE UPDATE ON public.map_poi_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_map_static_hazards_updated_at
  BEFORE UPDATE ON public.map_static_hazards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_wallets_updated_at
  BEFORE UPDATE ON public.user_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
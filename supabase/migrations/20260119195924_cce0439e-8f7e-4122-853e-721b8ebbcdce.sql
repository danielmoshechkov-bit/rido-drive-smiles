-- ==============================
-- WALLET SYSTEM ENHANCEMENTS
-- ==============================

-- Add coins columns to user_wallets if they don't exist
ALTER TABLE user_wallets 
ADD COLUMN IF NOT EXISTS coins_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent INTEGER DEFAULT 0;

-- Coin transactions table
CREATE TABLE IF NOT EXISTS coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'bonus', 'refund')),
  source TEXT NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on coin_transactions
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for coin_transactions
CREATE POLICY "Users can view own coin transactions" 
  ON coin_transactions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert coin transactions"
  ON coin_transactions FOR INSERT
  WITH CHECK (true);

-- ==============================
-- REFERRAL SYSTEM
-- ==============================

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  uses_count INTEGER DEFAULT 0,
  total_earnings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for referral_codes
CREATE POLICY "Users can view own referral code"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own referral code"
  ON referral_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all referral codes"
  ON referral_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Referral uses table
CREATE TABLE IF NOT EXISTS referral_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID REFERENCES referral_codes(id) ON DELETE CASCADE NOT NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer_user_id UUID NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'suspicious')),
  coins_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE referral_uses ENABLE ROW LEVEL SECURITY;

-- RLS policies for referral_uses
CREATE POLICY "Users can view own referral uses"
  ON referral_uses FOR SELECT
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

CREATE POLICY "Admins can view all referral uses"
  ON referral_uses FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "System can insert referral uses"
  ON referral_uses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update referral uses"
  ON referral_uses FOR UPDATE
  USING (true);

-- Referral alerts table
CREATE TABLE IF NOT EXISTS referral_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID REFERENCES referral_codes(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('same_ip', 'same_fleet', 'high_volume', 'pattern_detected')),
  description TEXT,
  details JSONB,
  is_reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE referral_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policy for referral_alerts (admin only)
CREATE POLICY "Admins can manage referral alerts"
  ON referral_alerts FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Referral settings table
CREATE TABLE IF NOT EXISTS referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN DEFAULT false,
  coins_per_referral INTEGER DEFAULT 50,
  max_referrals_per_day INTEGER DEFAULT 10,
  suspicious_same_ip_threshold INTEGER DEFAULT 3,
  min_days_before_payout INTEGER DEFAULT 7,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE referral_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy for referral_settings
CREATE POLICY "Anyone can read referral settings"
  ON referral_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update referral settings"
  ON referral_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Insert default settings
INSERT INTO referral_settings (is_enabled, coins_per_referral, max_referrals_per_day)
VALUES (false, 50, 10)
ON CONFLICT DO NOTHING;

-- Feature toggle for referral system (default: disabled)
INSERT INTO feature_toggles (feature_key, feature_name, is_enabled, description, category)
VALUES (
  'referral_system_enabled', 
  'System poleceń', 
  false, 
  'Włącz/wyłącz system poleceń i kodów afiliacyjnych',
  'marketplace'
)
ON CONFLICT (feature_key) DO NOTHING;

-- Central payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  product_type text NOT NULL CHECK (product_type IN (
    'marketplace_purchase','ai_photo_package','sms_credits',
    'ai_credits','listing_featured','subscription','inpost_label'
  )),
  product_ref_id uuid,
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'PLN',
  status text DEFAULT 'pending' CHECK (status IN (
    'pending','paid','failed','refunded','cancelled'
  )),
  gateway text DEFAULT 'przelewy24',
  gateway_session_id text,
  gateway_transaction_id text,
  description text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_payments_select" ON payments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_payments_insert" ON payments FOR INSERT WITH CHECK (user_id = auth.uid());

-- User credits
CREATE TABLE IF NOT EXISTS user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  credit_type text NOT NULL CHECK (credit_type IN ('sms','ai','ai_photo','listing_featured')),
  balance integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, credit_type)
);
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_credits" ON user_credits FOR ALL USING (user_id = auth.uid());

-- Marketplace orders
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES payments(id),
  buyer_id uuid REFERENCES auth.users NOT NULL,
  seller_id uuid REFERENCES auth.users NOT NULL,
  listing_id uuid,
  amount numeric(10,2) NOT NULL,
  delivery_type text CHECK (delivery_type IN ('inpost','dpd','pickup')),
  delivery_address jsonb,
  inpost_point_id text,
  inpost_label_url text,
  order_status text DEFAULT 'new' CHECK (order_status IN (
    'new','paid','shipped','delivered','completed','cancelled'
  )),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_access" ON marketplace_orders FOR ALL USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Credit packages
CREATE TABLE IF NOT EXISTS credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_type text NOT NULL,
  name text NOT NULL,
  credits_amount integer NOT NULL,
  price numeric(6,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_packages" ON credit_packages FOR SELECT USING (true);

INSERT INTO credit_packages (credit_type, name, credits_amount, price) VALUES
  ('sms', 'Pakiet SMS 50', 50, 19.00),
  ('sms', 'Pakiet SMS 200', 200, 59.00),
  ('sms', 'Pakiet SMS 500', 500, 129.00),
  ('ai_photo', 'AI Zdjęcia — 5 sztuk', 5, 5.00),
  ('ai_photo', 'AI Zdjęcia — 20 sztuk', 20, 15.00),
  ('listing_featured', 'Wyróżnienie ogłoszenia 7 dni', 1, 9.00);

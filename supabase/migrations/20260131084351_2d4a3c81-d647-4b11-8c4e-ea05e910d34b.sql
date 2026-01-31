-- Dodanie cen zakupu do inventory_products
ALTER TABLE inventory_products
ADD COLUMN IF NOT EXISTS default_purchase_price_net NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS default_purchase_price_gross NUMERIC(12,2);

-- Tabela kategorii produktów (słownik)
CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES inventory_categories(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entity_id, name)
);

-- RLS dla kategorii
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

-- Policy dla kategorii - users can see and manage their own categories
CREATE POLICY "Users can manage their categories" ON inventory_categories
  FOR ALL USING (auth.uid() = user_id);
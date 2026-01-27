-- ============================================
-- FAZA 1: MAGAZYN - Tabele, RLS, Feature Flags
-- ============================================

-- 1. Feature Flags dla modułu Magazyn
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category) VALUES
  ('inventory_enabled', 'Moduł Magazyn', 'Główny przełącznik modułu magazynowego', true, 'inventory'),
  ('inventory_purchase_ocr_enabled', 'OCR faktur zakupowych', 'Automatyczne rozpoznawanie pozycji z faktur zakupowych', true, 'inventory'),
  ('inventory_alias_mapping_enabled', 'Mapowanie aliasów', 'Powiązania nazw z faktur do produktów w magazynie', true, 'inventory'),
  ('inventory_price_suggestions_enabled', 'Sugestie cen', 'Automatyczne podpowiadanie cen i pytanie o zapis domyślnej', true, 'inventory'),
  ('inventory_profit_alerts_enabled', 'Ostrzeżenia marży', 'Ostrzeżenie przy sprzedaży poniżej ceny zakupu', true, 'inventory'),
  ('inventory_stocktaking_enabled', 'Inwentaryzacja', 'Moduł inwentaryzacji z wydrukiem listy', true, 'inventory'),
  ('inventory_barcode_enabled', 'Kody kreskowe', 'Obsługa kodów kreskowych produktów', false, 'inventory'),
  ('inventory_profit_analytics_enabled', 'Analityka zysku', 'Podsumowanie zysku i szacowanych podatków', true, 'inventory')
ON CONFLICT (feature_key) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;

-- 2. Produkty magazynowe (kartoteka towarów)
CREATE TABLE IF NOT EXISTS public.inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name_sales TEXT NOT NULL,
  sku TEXT,
  vat_rate TEXT DEFAULT '23',
  unit TEXT DEFAULT 'szt.',
  default_sale_price_net NUMERIC(12,2),
  default_sale_price_gross NUMERIC(12,2),
  currency TEXT DEFAULT 'PLN',
  barcode TEXT,
  category TEXT,
  notes TEXT,
  attributes JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indeksy dla produktów
CREATE INDEX IF NOT EXISTS idx_inventory_products_entity_id ON public.inventory_products(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_products_user_id ON public.inventory_products(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_products_barcode ON public.inventory_products(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_products_name ON public.inventory_products USING GIN (to_tsvector('simple', name_sales));

-- 3. Aliasy produktów (mapowanie nazw z faktur)
CREATE TABLE IF NOT EXISTS public.inventory_product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE CASCADE NOT NULL,
  supplier_name TEXT,
  supplier_nip TEXT,
  source_label TEXT NOT NULL,
  normalized_label TEXT,
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_aliases_product ON public.inventory_product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_aliases_supplier ON public.inventory_product_aliases(supplier_nip);

-- 4. Dokumenty zakupowe (faktury zakupu z OCR)
CREATE TABLE IF NOT EXISTS public.purchase_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  supplier_name TEXT,
  supplier_nip TEXT,
  supplier_snapshot JSONB,
  file_url TEXT,
  file_name TEXT,
  document_number TEXT,
  document_date DATE,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'parsed', 'needs_review', 'approved', 'corrected')),
  ocr_raw_json JSONB,
  ocr_processed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  approved_version INT DEFAULT 1,
  net_total NUMERIC(12,2),
  vat_total NUMERIC(12,2),
  gross_total NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_docs_user ON public.purchase_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_docs_entity ON public.purchase_documents(entity_id);
CREATE INDEX IF NOT EXISTS idx_purchase_docs_status ON public.purchase_documents(status);

-- 5. Pozycje dokumentów zakupowych
CREATE TABLE IF NOT EXISTS public.purchase_document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_document_id UUID REFERENCES public.purchase_documents(id) ON DELETE CASCADE NOT NULL,
  raw_name_from_invoice TEXT,
  qty NUMERIC(12,4) DEFAULT 1,
  unit TEXT DEFAULT 'szt.',
  unit_net NUMERIC(12,4),
  vat_rate TEXT DEFAULT '23',
  net_total NUMERIC(12,2),
  vat_total NUMERIC(12,2),
  gross_total NUMERIC(12,2),
  mapped_product_id UUID REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  remember_mapping BOOLEAN DEFAULT false,
  is_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_doc ON public.purchase_document_items(purchase_document_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON public.purchase_document_items(mapped_product_id);

-- 6. Partie magazynowe (FIFO - koszt zakupu)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE CASCADE NOT NULL,
  purchase_document_id UUID REFERENCES public.purchase_documents(id) ON DELETE SET NULL,
  purchase_item_id UUID REFERENCES public.purchase_document_items(id) ON DELETE SET NULL,
  qty_in NUMERIC(12,4) NOT NULL,
  qty_remaining NUMERIC(12,4) NOT NULL,
  unit_cost_net NUMERIC(12,4),
  vat_rate TEXT DEFAULT '23',
  received_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON public.inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_remaining ON public.inventory_batches(qty_remaining) WHERE qty_remaining > 0;

-- 7. Ruchy magazynowe (pełna historia)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE CASCADE NOT NULL,
  batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out', 'adjust')),
  qty NUMERIC(12,4) NOT NULL,
  source_type TEXT CHECK (source_type IN ('purchase', 'sale', 'stocktaking', 'manual_adjust', 'correction')),
  source_id UUID,
  unit_cost_net NUMERIC(12,4),
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON public.inventory_movements(created_at DESC);

-- 8. Inwentaryzacje
CREATE TABLE IF NOT EXISTS public.stocktakings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stocktakings_user ON public.stocktakings(user_id);

-- 9. Pozycje inwentaryzacji
CREATE TABLE IF NOT EXISTS public.stocktaking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktaking_id UUID REFERENCES public.stocktakings(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.inventory_products(id) ON DELETE CASCADE NOT NULL,
  system_qty NUMERIC(12,4) DEFAULT 0,
  counted_qty NUMERIC(12,4),
  diff_qty NUMERIC(12,4),
  applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stocktaking_items_stocktaking ON public.stocktaking_items(stocktaking_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Włącz RLS dla wszystkich tabel
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktakings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktaking_items ENABLE ROW LEVEL SECURITY;

-- Polityki dla inventory_products
CREATE POLICY "Users can manage own products" ON public.inventory_products
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Entity owners can manage products" ON public.inventory_products
  FOR ALL USING (
    entity_id IS NOT NULL AND 
    EXISTS (SELECT 1 FROM public.entities e WHERE e.id = entity_id AND e.owner_user_id = auth.uid())
  );

-- Polityki dla inventory_product_aliases
CREATE POLICY "Users can manage own aliases" ON public.inventory_product_aliases
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Entity owners can manage aliases" ON public.inventory_product_aliases
  FOR ALL USING (
    entity_id IS NOT NULL AND 
    EXISTS (SELECT 1 FROM public.entities e WHERE e.id = entity_id AND e.owner_user_id = auth.uid())
  );

-- Polityki dla purchase_documents
CREATE POLICY "Users can manage own purchase documents" ON public.purchase_documents
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Entity owners can manage purchase documents" ON public.purchase_documents
  FOR ALL USING (
    entity_id IS NOT NULL AND 
    EXISTS (SELECT 1 FROM public.entities e WHERE e.id = entity_id AND e.owner_user_id = auth.uid())
  );

-- Polityki dla purchase_document_items (przez dokument)
CREATE POLICY "Users can manage purchase items" ON public.purchase_document_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.purchase_documents pd WHERE pd.id = purchase_document_id AND pd.user_id = auth.uid())
  );

-- Polityki dla inventory_batches
CREATE POLICY "Users can manage batches via product" ON public.inventory_batches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.inventory_products ip WHERE ip.id = product_id AND ip.user_id = auth.uid())
  );

-- Polityki dla inventory_movements
CREATE POLICY "Users can manage movements via product" ON public.inventory_movements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.inventory_products ip WHERE ip.id = product_id AND ip.user_id = auth.uid())
  );

-- Polityki dla stocktakings
CREATE POLICY "Users can manage own stocktakings" ON public.stocktakings
  FOR ALL USING (auth.uid() = user_id);

-- Polityki dla stocktaking_items
CREATE POLICY "Users can manage stocktaking items" ON public.stocktaking_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.stocktakings st WHERE st.id = stocktaking_id AND st.user_id = auth.uid())
  );

-- ============================================
-- TRIGGERY
-- ============================================

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION public.update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_inventory_products_updated_at
  BEFORE UPDATE ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.update_inventory_updated_at();

CREATE TRIGGER update_purchase_documents_updated_at
  BEFORE UPDATE ON public.purchase_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_inventory_updated_at();

CREATE TRIGGER update_stocktakings_updated_at
  BEFORE UPDATE ON public.stocktakings
  FOR EACH ROW EXECUTE FUNCTION public.update_inventory_updated_at();

-- Funkcja do obliczania stanu magazynowego produktu
CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id UUID)
RETURNS NUMERIC AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(qty_remaining) FROM public.inventory_batches WHERE product_id = p_product_id),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Funkcja do pobierania średniego kosztu zakupu (weighted average)
CREATE OR REPLACE FUNCTION public.get_product_avg_cost(p_product_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total_cost NUMERIC;
  v_total_qty NUMERIC;
BEGIN
  SELECT 
    SUM(qty_remaining * COALESCE(unit_cost_net, 0)),
    SUM(qty_remaining)
  INTO v_total_cost, v_total_qty
  FROM public.inventory_batches 
  WHERE product_id = p_product_id AND qty_remaining > 0;
  
  IF v_total_qty > 0 THEN
    RETURN ROUND(v_total_cost / v_total_qty, 4);
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
-- Inter Cars catalog category tree — globalny cache (drzewo TecDoc-based)
-- Synchronizowany rekurencyjnie z GET /ic/catalog/category?categoryId={X}
-- Używany do AI klasyfikacji query → categoryId + filtrowania products.

CREATE TABLE IF NOT EXISTS public.ic_category_tree (
  category_id  text PRIMARY KEY,
  parent_id    text,
  label        text NOT NULL,
  level        int NOT NULL,
  full_path    text NOT NULL,
  has_children boolean NOT NULL DEFAULT false,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_cat_parent ON public.ic_category_tree(parent_id);
CREATE INDEX IF NOT EXISTS idx_ic_cat_label_fts ON public.ic_category_tree
  USING gin(to_tsvector('simple', label || ' ' || full_path));

ALTER TABLE public.ic_category_tree ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read ic category tree" ON public.ic_category_tree;
CREATE POLICY "Auth read ic category tree"
  ON public.ic_category_tree FOR SELECT TO authenticated USING (true);

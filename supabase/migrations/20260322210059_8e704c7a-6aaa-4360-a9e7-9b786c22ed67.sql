
CREATE TABLE IF NOT EXISTS public.supplier_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  supplier_symbol TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.supplier_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read supplier_mappings"
  ON public.supplier_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert supplier_mappings"
  ON public.supplier_mappings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Rozszerzenie purchase_invoices o pola dla AI parsera, akceptacji i magazynu
ALTER TABLE public.purchase_invoices 
  ADD COLUMN IF NOT EXISTS confidence numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_processed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS vat_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supplier_address text,
  ADD COLUMN IF NOT EXISTS supplier_account text,
  ADD COLUMN IF NOT EXISTS sale_date date,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'PLN',
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Backfill issue_date z purchase_date jesli puste
UPDATE public.purchase_invoices SET issue_date = purchase_date WHERE issue_date IS NULL AND purchase_date IS NOT NULL;

-- Indeksy do szybkich zapytań per miesiąc
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_user_issue_date 
  ON public.purchase_invoices(user_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_needs_review 
  ON public.purchase_invoices(user_id, needs_review) WHERE needs_review = true;

-- Storage bucket dla PDF faktur zakupowych (jeśli nie istnieje)
INSERT INTO storage.buckets (id, name, public)
VALUES ('purchase-invoices', 'purchase-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- RLS dla bucketu
DROP POLICY IF EXISTS "Users upload own purchase invoices" ON storage.objects;
CREATE POLICY "Users upload own purchase invoices"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'purchase-invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users read own purchase invoices" ON storage.objects;
CREATE POLICY "Users read own purchase invoices"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'purchase-invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own purchase invoices" ON storage.objects;
CREATE POLICY "Users delete own purchase invoices"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'purchase-invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Wzmocnienie RLS dla purchase_invoice_items - powinny być per-user przez join
DROP POLICY IF EXISTS "auth purchase items" ON public.purchase_invoice_items;
CREATE POLICY "Users see items via invoice owner"
ON public.purchase_invoice_items FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.purchase_invoices pi 
  WHERE pi.id = purchase_invoice_items.purchase_invoice_id 
  AND pi.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.purchase_invoices pi 
  WHERE pi.id = purchase_invoice_items.purchase_invoice_id 
  AND pi.user_id = auth.uid()
));
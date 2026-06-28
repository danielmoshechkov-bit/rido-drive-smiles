-- Soft-delete dla faktur zakupowych (narzędzie księgowe — audytowalność).
-- Faktura znika z listy (deleted_at IS NOT NULL), ale zostaje w bazie ze śladem kto/kiedy.

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.purchase_invoices.deleted_at IS
  'Soft-delete: czas usunięcia z listy (NULL = aktywna). Rekord zostaje w bazie dla audytu / cofnięcia.';
COMMENT ON COLUMN public.purchase_invoices.deleted_by IS
  'Soft-delete: user.id osoby, która usunęła fakturę z listy.';

-- Indeks pod domyślny widok (tylko aktywne, po okresie)
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_active
  ON public.purchase_invoices (entity_id, purchase_date)
  WHERE deleted_at IS NULL;

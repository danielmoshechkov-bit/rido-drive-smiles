-- Soft-delete dla faktur sprzedaży w portalu usługodawcy/klienta (tabela `user_invoices`).
-- Spójność z invoices + purchase_invoices (audytowalność). Lista filtruje deleted_at IS NULL,
-- usuwanie zbiorcze = ustawienie deleted_at (miękkie). Istniejące twarde DELETE w
-- InvoiceExpandableRow/InvoiceListWithActions to osobny dług do ujednolicenia później.

ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.user_invoices.deleted_at IS
  'Soft-delete: czas usunięcia z listy (NULL = aktywna). Rekord zostaje w bazie dla audytu / cofnięcia.';
COMMENT ON COLUMN public.user_invoices.deleted_by IS
  'Soft-delete: user.id osoby, która usunęła fakturę z listy.';

CREATE INDEX IF NOT EXISTS idx_user_invoices_active
  ON public.user_invoices (user_id, issue_date)
  WHERE deleted_at IS NULL;

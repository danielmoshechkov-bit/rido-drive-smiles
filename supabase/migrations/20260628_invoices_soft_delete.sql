-- Soft-delete dla faktur sprzedaży (tabela `invoices`) — spójnie z purchase_invoices.
-- UWAGA: dotyczy NOWEJ listy Sprzedażowe w InvoicesModule. Istniejące twarde usuwanie
-- w InvoiceListWithActions (tabela user_invoices) to osobny dług do ujednolicenia później.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.invoices.deleted_at IS
  'Soft-delete: czas usunięcia z listy (NULL = aktywna). Rekord zostaje w bazie dla audytu / cofnięcia.';
COMMENT ON COLUMN public.invoices.deleted_by IS
  'Soft-delete: user.id osoby, która usunęła fakturę z listy.';

CREATE INDEX IF NOT EXISTS idx_invoices_active
  ON public.invoices (entity_id, issue_date)
  WHERE deleted_at IS NULL;

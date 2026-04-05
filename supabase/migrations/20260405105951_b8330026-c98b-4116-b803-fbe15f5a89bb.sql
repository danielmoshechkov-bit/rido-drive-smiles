ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS correction_reason text;
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS advance_invoice_id uuid REFERENCES user_invoices(id);
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS advance_invoice_number text;
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS advance_ksef_reference text;
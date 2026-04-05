
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS margin_purchase_price numeric;
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS margin_procedure_type text;
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS is_margin boolean DEFAULT false;
ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS correction_reason text;

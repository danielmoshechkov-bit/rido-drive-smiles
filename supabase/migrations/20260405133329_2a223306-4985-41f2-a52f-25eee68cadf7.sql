ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS buyer_email text;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
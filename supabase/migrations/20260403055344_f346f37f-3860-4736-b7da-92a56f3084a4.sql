
ALTER TABLE ksef_transmissions ADD COLUMN IF NOT EXISTS upo_content text;
ALTER TABLE ksef_transmissions ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS xml_content text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ksef_environment text;

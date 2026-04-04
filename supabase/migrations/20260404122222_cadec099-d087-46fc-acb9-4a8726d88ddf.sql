ALTER TABLE user_invoices ADD COLUMN IF NOT EXISTS ksef_invoice_ref text;
ALTER TABLE ksef_transmissions ADD COLUMN IF NOT EXISTS ksef_invoice_ref text;
ALTER TABLE ksef_transmissions ADD COLUMN IF NOT EXISTS upo_download_url text;
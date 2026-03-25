-- Table for KSeF alert email subscriptions
CREATE TABLE IF NOT EXISTS ksef_alert_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE ksef_alert_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on ksef_alert_emails"
  ON ksef_alert_emails FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Add ksef_number to purchase_invoices if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_invoices' AND column_name = 'ksef_number'
  ) THEN
    ALTER TABLE purchase_invoices ADD COLUMN ksef_number text UNIQUE;
  END IF;
END $$;

-- Modify drivers table to add platform_ids as JSONB
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS platform_ids JSONB DEFAULT '{"uber": [], "bolt": [], "freeNow": []}'::jsonb;

-- Create settlements table if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'settlements') THEN
    CREATE TABLE settlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('uber', 'bolt', 'freenow', 'main')),
      period_from DATE NOT NULL,
      period_to DATE NOT NULL,
      raw_row_id TEXT NOT NULL UNIQUE,
      amounts JSONB NOT NULL DEFAULT '{}'::jsonb,
      raw JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
    
    CREATE INDEX idx_settlements_driver_id ON settlements(driver_id);
    CREATE INDEX idx_settlements_period ON settlements(period_from, period_to);
    CREATE INDEX idx_settlements_raw_row_id ON settlements(raw_row_id);
  END IF;
END $$;

-- Drop and recreate policy for settlements
DROP POLICY IF EXISTS "Admins can manage settlements" ON settlements;
CREATE POLICY "Admins can manage settlements"
ON settlements
FOR ALL
USING (true);

-- Add trigger for settlements if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_settlements_updated_at'
  ) THEN
    CREATE TRIGGER update_settlements_updated_at
      BEFORE UPDATE ON settlements
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create visibility settings table
CREATE TABLE IF NOT EXISTS rido_visibility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_uber_card BOOLEAN DEFAULT true,
  show_uber_cash BOOLEAN DEFAULT true,
  show_bolt_gross BOOLEAN DEFAULT false,
  show_bolt_net BOOLEAN DEFAULT true,
  show_bolt_cash BOOLEAN DEFAULT false,
  show_freenow_gross BOOLEAN DEFAULT false,
  show_freenow_net BOOLEAN DEFAULT true,
  show_freenow_cash BOOLEAN DEFAULT false,
  show_fuel BOOLEAN DEFAULT true,
  show_vat_from_fuel BOOLEAN DEFAULT false,
  show_vat_refund_half BOOLEAN DEFAULT false,
  show_commission BOOLEAN DEFAULT false,
  show_tax BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rido_visibility_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage visibility settings" ON rido_visibility_settings;
CREATE POLICY "Admins can manage visibility settings"
ON rido_visibility_settings
FOR ALL
USING (true);

INSERT INTO rido_visibility_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Create deduplication settings table
CREATE TABLE IF NOT EXISTS rido_dedup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prefer_match_by_email BOOLEAN DEFAULT true,
  prefer_match_by_phone BOOLEAN DEFAULT true,
  allow_match_by_platform_ids BOOLEAN DEFAULT true,
  ignore_empty_email_phone BOOLEAN DEFAULT true,
  phone_country_default TEXT DEFAULT 'PL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rido_dedup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage dedup settings" ON rido_dedup_settings;
CREATE POLICY "Admins can manage dedup settings"
ON rido_dedup_settings
FOR ALL
USING (true);

INSERT INTO rido_dedup_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Add triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_rido_visibility_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_rido_visibility_settings_updated_at
      BEFORE UPDATE ON rido_visibility_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_rido_dedup_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_rido_dedup_settings_updated_at
      BEFORE UPDATE ON rido_dedup_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
-- Migration: settlements table to new structure with amounts JSONB

-- Step 1: Add new columns
ALTER TABLE settlements
ADD COLUMN IF NOT EXISTS period_from date,
ADD COLUMN IF NOT EXISTS period_to date,
ADD COLUMN IF NOT EXISTS amounts jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS source text,
ADD COLUMN IF NOT EXISTS raw jsonb DEFAULT '{}'::jsonb;

-- Step 2: Migrate existing data to new structure
UPDATE settlements
SET 
  period_from = week_start,
  period_to = week_end,
  source = platform,
  amounts = jsonb_build_object(
    'total_earnings', COALESCE(total_earnings, 0),
    'commission_amount', COALESCE(commission_amount, 0),
    'net_amount', COALESCE(net_amount, 0),
    'rental_fee', COALESCE(rental_fee, 0)
  )
WHERE period_from IS NULL;

-- Step 3: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_settlements_period_from ON settlements(period_from);
CREATE INDEX IF NOT EXISTS idx_settlements_period_to ON settlements(period_to);
CREATE INDEX IF NOT EXISTS idx_settlements_source ON settlements(source);
CREATE INDEX IF NOT EXISTS idx_settlements_amounts ON settlements USING gin(amounts);

-- Step 4: Add comments for documentation
COMMENT ON COLUMN settlements.amounts IS 'JSONB field storing all settlement amounts: total_earnings, commission_amount, net_amount, rental_fee, etc.';
COMMENT ON COLUMN settlements.source IS 'Data source/platform identifier (uber, bolt, freenow, main)';
COMMENT ON COLUMN settlements.raw IS 'Raw data from CSV import for auditing purposes';

-- Note: Old columns (week_start, week_end, platform, total_earnings, commission_amount, net_amount, rental_fee) 
-- are kept for backward compatibility. They can be dropped later after verifying all code works with new structure.
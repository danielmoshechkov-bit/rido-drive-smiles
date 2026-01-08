-- Add settlement_frequency column to driver_app_users
ALTER TABLE driver_app_users 
ADD COLUMN IF NOT EXISTS settlement_frequency TEXT DEFAULT 'weekly' 
CHECK (settlement_frequency IN ('weekly', 'biweekly', 'triweekly', 'monthly'));

-- Add settlement_frequency_enabled toggle to fleets
ALTER TABLE fleets
ADD COLUMN IF NOT EXISTS settlement_frequency_enabled BOOLEAN DEFAULT false;

-- Create table for tracking accumulated earnings (for non-weekly frequency)
CREATE TABLE IF NOT EXISTS driver_accumulated_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  gross_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on the new table
ALTER TABLE driver_accumulated_earnings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for driver_accumulated_earnings
CREATE POLICY "Fleet owners can view their drivers accumulated earnings"
ON driver_accumulated_earnings
FOR SELECT
USING (
  driver_id IN (
    SELECT d.id FROM drivers d
    JOIN fleets f ON d.fleet_id = f.id
    WHERE f.id IN (
      SELECT fleet_id FROM fleet_delegated_roles 
      WHERE assigned_to_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins can manage all accumulated earnings"
ON driver_accumulated_earnings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM driver_app_users dau 
    JOIN drivers d ON dau.driver_id = d.id 
    WHERE dau.user_id = auth.uid() 
    AND d.user_role = 'admin'
  )
);

CREATE POLICY "Drivers can view their own accumulated earnings"
ON driver_accumulated_earnings
FOR SELECT
USING (
  driver_id IN (
    SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_driver_accumulated_earnings_driver ON driver_accumulated_earnings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_accumulated_earnings_period ON driver_accumulated_earnings(period_from, period_to);
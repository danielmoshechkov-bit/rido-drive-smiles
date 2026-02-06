-- Add driver_id column to unmapped_settlement_drivers for linking to created drivers
ALTER TABLE unmapped_settlement_drivers 
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

-- Add index for faster queries by fleet and status
CREATE INDEX IF NOT EXISTS idx_unmapped_drivers_fleet_status 
ON unmapped_settlement_drivers(fleet_id, status);

-- Add index for driver_id lookups
CREATE INDEX IF NOT EXISTS idx_unmapped_drivers_driver_id 
ON unmapped_settlement_drivers(driver_id);
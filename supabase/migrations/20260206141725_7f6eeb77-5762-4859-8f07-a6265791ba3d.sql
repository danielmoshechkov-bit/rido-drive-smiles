-- Add unique constraint on driver_id for unmapped_settlement_drivers to support upsert
-- First, remove any duplicates if they exist
DELETE FROM unmapped_settlement_drivers a
USING unmapped_settlement_drivers b
WHERE a.id > b.id 
  AND a.driver_id IS NOT NULL 
  AND a.driver_id = b.driver_id;

-- Add unique constraint
ALTER TABLE unmapped_settlement_drivers 
ADD CONSTRAINT unmapped_settlement_drivers_driver_id_key UNIQUE (driver_id);
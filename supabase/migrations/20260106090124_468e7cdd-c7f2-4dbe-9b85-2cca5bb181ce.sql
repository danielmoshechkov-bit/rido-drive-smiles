-- Add missing vehicle attributes for marketplace listings
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS engine_capacity INTEGER,
ADD COLUMN IF NOT EXISTS power INTEGER,
ADD COLUMN IF NOT EXISTS body_type TEXT;

-- Add comment for documentation
COMMENT ON COLUMN vehicles.engine_capacity IS 'Engine capacity in cm3';
COMMENT ON COLUMN vehicles.power IS 'Power in HP (KM)';
COMMENT ON COLUMN vehicles.body_type IS 'Body type: sedan, kombi, hatchback, suv, coupe, cabrio, minivan, pickup';
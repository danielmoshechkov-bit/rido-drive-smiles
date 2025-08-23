-- Add owner_name column if not exists
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS owner_name TEXT;

-- Add index on owner_name
CREATE INDEX IF NOT EXISTS idx_vehicles_owner_name ON vehicles(owner_name);

-- Create service_types table
CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default service types
INSERT INTO service_types(name)
SELECT x FROM (VALUES
  ('Wymiana oleju'),('Przegląd'),('Naprawa'),('Wymiana części'),('Inne')
) s(x) ON CONFLICT (name) DO NOTHING;

-- Function to uppercase plate and VIN
CREATE OR REPLACE FUNCTION vehicles_uppercase_plate_vin() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plate IS NOT NULL THEN NEW.plate := UPPER(NEW.plate); END IF;
  IF NEW.vin IS NOT NULL THEN NEW.vin := UPPER(NEW.vin); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_vehicles_upper ON vehicles;

-- Create trigger for uppercase plate/VIN
CREATE TRIGGER trg_vehicles_upper
BEFORE INSERT OR UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION vehicles_uppercase_plate_vin();

-- Add RLS policy for service_types
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage service types" 
ON service_types 
FOR ALL 
USING (true);
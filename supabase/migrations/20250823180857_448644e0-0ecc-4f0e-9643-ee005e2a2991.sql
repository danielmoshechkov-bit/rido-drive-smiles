-- ================================================================
-- RIDO FLEET + DRIVER PORTAL - Database Migration
-- ================================================================

-- 1) Floty (słownik)
CREATE TABLE IF NOT EXISTS fleets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Predefiniowane floty
INSERT INTO fleets(name) VALUES ('GetRido'), ('AWSServices')
ON CONFLICT (name) DO NOTHING;

-- 2) Pojazdy: powiązanie z flotą
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fleet_id UUID REFERENCES fleets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_fleet_id ON vehicles(fleet_id);

-- 3) System ról kierowców
DO $$ BEGIN
  CREATE TYPE user_role_type AS ENUM ('kierowca', 'partner', 'pracownik', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_role user_role_type DEFAULT 'kierowca';

-- 4) Trigger UPPER dla plate/vin (upewnij się że istnieje)
CREATE OR REPLACE FUNCTION vehicles_uppercase_plate_vin() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plate IS NOT NULL THEN NEW.plate := UPPER(NEW.plate); END IF;
  IF NEW.vin IS NOT NULL THEN NEW.vin := UPPER(NEW.vin); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicles_upper ON vehicles;
CREATE TRIGGER trg_vehicles_upper
BEFORE INSERT OR UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION vehicles_uppercase_plate_vin();

-- 5) DRIVER PORTAL TABLES

-- Użytkownicy aplikacji kierowcy (mapowanie auth.users -> drivers)
CREATE TABLE IF NOT EXISTS driver_app_users (
  user_id UUID PRIMARY KEY,                      -- = auth.users.id
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  city_id UUID REFERENCES cities(id),
  phone TEXT,
  plan_type TEXT CHECK (plan_type IN ('39+8','159+0')) DEFAULT '39+8',
  rodo_accepted_at TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Wydatki na paliwo
CREATE TABLE IF NOT EXISTS fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  liters DECIMAL(10,2),
  station TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prosty czat (kierowca <-> admin)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  from_role TEXT CHECK (from_role IN ('driver','admin')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indeksy pomocnicze
CREATE INDEX IF NOT EXISTS idx_fuel_driver ON fuel_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_msg_driver ON messages(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_app_users_driver ON driver_app_users(driver_id);

-- RLS policies (tymczasowo wszystko dla adminów)
ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Admins can manage fleets" ON fleets FOR ALL USING (true);

ALTER TABLE driver_app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Admins can manage driver app users" ON driver_app_users FOR ALL USING (true);

ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Admins can manage fuel logs" ON fuel_logs FOR ALL USING (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Admins can manage messages" ON messages FOR ALL USING (true);

-- Dodaj storage bucket dla dokumentów kierowcy jeśli nie istnieje
INSERT INTO storage.buckets (id, name, public) 
VALUES ('driver-documents', 'driver-documents', true)
ON CONFLICT (id) DO NOTHING;
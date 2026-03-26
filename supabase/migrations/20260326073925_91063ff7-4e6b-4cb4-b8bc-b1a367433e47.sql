
-- Client private vehicles (separate from fleet vehicles)
CREATE TABLE IF NOT EXISTS client_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Vehicle data
  plate_number text,
  vin text,
  make text,
  model text,
  year integer,
  engine_capacity text,
  fuel_type text,
  color text,
  -- Dates
  mot_expiry date, -- przegląd
  oc_expiry date, -- OC
  -- Photos
  photos text[] DEFAULT '{}',
  -- Ownership
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  -- Linked workshop vehicle (if matched)
  workshop_vehicle_id uuid,
  -- Sold flag
  is_sold boolean DEFAULT false,
  sold_at timestamptz,
  transfer_history_to_new_owner boolean,
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE client_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicles"
  ON client_vehicles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own vehicles"
  ON client_vehicles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own vehicles"
  ON client_vehicles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Client vehicle service history (linked from workshop orders)
CREATE TABLE IF NOT EXISTS client_vehicle_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_vehicle_id uuid REFERENCES client_vehicles(id) ON DELETE CASCADE NOT NULL,
  -- Service details
  service_date date NOT NULL,
  mileage integer,
  description text,
  cost numeric(10,2),
  -- Workshop info
  workshop_name text,
  workshop_order_id uuid,
  -- Document
  signed_estimate_url text,
  -- Meta
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_vehicle_service_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicle service history"
  ON client_vehicle_service_history FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM client_vehicles cv WHERE cv.id = client_vehicle_id AND cv.user_id = auth.uid())
  );

-- Pending ownership verifications (when workshop adds a vehicle linked to phone)
CREATE TABLE IF NOT EXISTS client_vehicle_ownership_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  -- Vehicle data to verify against
  plate_number text,
  vin text,
  make text,
  model text,
  year integer,
  engine_capacity text,
  -- Workshop vehicle reference
  workshop_vehicle_id uuid,
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by_user_id uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_vehicle_ownership_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ownership requests by their phone"
  ON client_vehicle_ownership_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update ownership requests"
  ON client_vehicle_ownership_requests FOR UPDATE TO authenticated
  USING (true);

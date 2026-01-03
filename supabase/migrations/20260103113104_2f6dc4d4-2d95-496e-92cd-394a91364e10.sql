-- Dodaj kolumnę zdjęć do pojazdów
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

-- Ogłoszenia na giełdzie
CREATE TABLE IF NOT EXISTS vehicle_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  weekly_price numeric NOT NULL,
  is_available boolean DEFAULT true,
  listed_at timestamp with time zone DEFAULT now(),
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Rezerwacje/najmy
CREATE TABLE IF NOT EXISTS vehicle_rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES vehicle_listings(id) ON DELETE CASCADE NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE NOT NULL,
  fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'active', 'completed', 'cancelled', 'rejected')),
  weekly_price numeric NOT NULL,
  rental_start date,
  rental_end date,
  driver_reviewed boolean DEFAULT false,
  fleet_reviewed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Oceny
CREATE TABLE IF NOT EXISTS rental_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id uuid REFERENCES vehicle_rentals(id) ON DELETE CASCADE NOT NULL,
  reviewer_type text NOT NULL CHECK (reviewer_type IN ('driver', 'fleet')),
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  
  -- Oceny kierowcy dla floty (1-5)
  car_condition_rating integer CHECK (car_condition_rating BETWEEN 1 AND 5),
  service_quality_rating integer CHECK (service_quality_rating BETWEEN 1 AND 5),
  problem_help_rating integer CHECK (problem_help_rating BETWEEN 1 AND 5),
  
  -- Ocena flotowego dla kierowcy (1-5)
  driver_rating integer CHECK (driver_rating BETWEEN 1 AND 5),
  
  comment text,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_vehicle_listings_available ON vehicle_listings(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_vehicle_rentals_status ON vehicle_rentals(status);
CREATE INDEX IF NOT EXISTS idx_vehicle_rentals_driver ON vehicle_rentals(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_rentals_fleet ON vehicle_rentals(fleet_id);
CREATE INDEX IF NOT EXISTS idx_rental_reviews_status ON rental_reviews(status);

-- RLS
ALTER TABLE vehicle_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_reviews ENABLE ROW LEVEL SECURITY;

-- Polityki vehicle_listings
CREATE POLICY "Public can view available listings" ON vehicle_listings
FOR SELECT USING (is_available = true);

CREATE POLICY "Fleet can manage own listings" ON vehicle_listings
FOR ALL USING (fleet_id = get_user_fleet_id(auth.uid()))
WITH CHECK (fleet_id = get_user_fleet_id(auth.uid()));

CREATE POLICY "Admin can manage all listings" ON vehicle_listings
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Polityki vehicle_rentals
CREATE POLICY "Drivers can view own rentals" ON vehicle_rentals
FOR SELECT USING (driver_id IN (SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()));

CREATE POLICY "Drivers can create rental requests" ON vehicle_rentals
FOR INSERT WITH CHECK (driver_id IN (SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()));

CREATE POLICY "Drivers can update own rentals" ON vehicle_rentals
FOR UPDATE USING (driver_id IN (SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()));

CREATE POLICY "Fleet can view their rentals" ON vehicle_rentals
FOR SELECT USING (fleet_id = get_user_fleet_id(auth.uid()));

CREATE POLICY "Fleet can manage their rentals" ON vehicle_rentals
FOR UPDATE USING (fleet_id = get_user_fleet_id(auth.uid()));

CREATE POLICY "Admin can manage all rentals" ON vehicle_rentals
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Polityki rental_reviews
CREATE POLICY "Users can view approved reviews" ON rental_reviews
FOR SELECT USING (status = 'approved');

CREATE POLICY "Users can create own reviews" ON rental_reviews
FOR INSERT WITH CHECK (
  reviewer_id IN (SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()) OR
  reviewer_id = get_user_fleet_id(auth.uid())
);

CREATE POLICY "Admin can manage all reviews" ON rental_reviews
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));
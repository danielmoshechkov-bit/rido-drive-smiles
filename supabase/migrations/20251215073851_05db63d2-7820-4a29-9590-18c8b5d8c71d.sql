-- 1. Add RLS policy for drivers to insert their own vehicles
CREATE POLICY "Drivers can insert their own vehicles"
ON vehicles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR (fleet_id IS NULL AND city_id IN (
    SELECT dau.city_id FROM driver_app_users dau WHERE dau.user_id = auth.uid()
    UNION
    SELECT d.city_id FROM drivers d 
    JOIN driver_app_users dau ON dau.driver_id = d.id 
    WHERE dau.user_id = auth.uid()
  ))
);

-- 2. Add RLS policy for drivers to update their own vehicles
CREATE POLICY "Drivers can update their own vehicles"
ON vehicles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR (id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR (id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

-- 3. Add RLS policies for vehicle_inspections for drivers
CREATE POLICY "Drivers can insert inspections for their vehicles"
ON vehicle_inspections
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (vehicle_id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

CREATE POLICY "Drivers can view inspections for their vehicles"
ON vehicle_inspections
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (vehicle_id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

-- 4. Add RLS policies for vehicle_policies for drivers
CREATE POLICY "Drivers can insert policies for their vehicles"
ON vehicle_policies
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (vehicle_id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

CREATE POLICY "Drivers can view policies for their vehicles"
ON vehicle_policies
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (vehicle_id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

-- 5. Add RLS policies for vehicle_services for drivers
CREATE POLICY "Drivers can insert services for their vehicles"
ON vehicle_services
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (vehicle_id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

CREATE POLICY "Drivers can view services for their vehicles"
ON vehicle_services
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (vehicle_id IN (
    SELECT dva.vehicle_id FROM driver_vehicle_assignments dva
    JOIN driver_app_users dau ON dau.driver_id = dva.driver_id
    WHERE dau.user_id = auth.uid() AND dva.status = 'active'
  ))
);

-- 6. Add RLS policy for drivers to insert their own vehicle assignments
CREATE POLICY "Drivers can insert their own vehicle assignments"
ON driver_vehicle_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (fleet_id = get_user_fleet_id(auth.uid()))
  OR (driver_id IN (
    SELECT dau.driver_id FROM driver_app_users dau WHERE dau.user_id = auth.uid()
  ))
);

-- 7. Create notification_settings table for push notifications
CREATE TABLE IF NOT EXISTS notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean DEFAULT true,
  settlement_notifications boolean DEFAULT true,
  document_expiry_notifications boolean DEFAULT true,
  push_subscription jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on notification_settings
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Users can manage their own notification settings
CREATE POLICY "Users can manage their own notification settings"
ON notification_settings
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
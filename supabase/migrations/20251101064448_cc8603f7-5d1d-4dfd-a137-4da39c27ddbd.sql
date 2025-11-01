-- Create fleet invitations table
CREATE TABLE IF NOT EXISTS fleet_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id) NOT NULL,
  driver_id UUID REFERENCES drivers(id) NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id),
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(fleet_id, driver_id, status)
);

-- Enable RLS
ALTER TABLE fleet_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all invitations
CREATE POLICY "Admins can manage fleet invitations"
ON fleet_invitations
FOR ALL
USING (true);

-- Fleet users can view and create invitations for their fleet
CREATE POLICY "Fleet users can manage their fleet invitations"
ON fleet_invitations
FOR ALL
USING (
  fleet_id IN (
    SELECT fleet_id FROM user_roles WHERE user_id = auth.uid()
  )
);

-- Drivers can view invitations for themselves
CREATE POLICY "Drivers can view their invitations"
ON fleet_invitations
FOR SELECT
USING (
  driver_id IN (
    SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()
  )
);

-- Drivers can update (respond to) their invitations
CREATE POLICY "Drivers can respond to their invitations"
ON fleet_invitations
FOR UPDATE
USING (
  driver_id IN (
    SELECT driver_id FROM driver_app_users WHERE user_id = auth.uid()
  )
);
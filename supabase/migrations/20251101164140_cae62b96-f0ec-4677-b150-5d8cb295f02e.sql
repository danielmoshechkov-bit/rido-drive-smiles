-- Create fleet_delegated_roles table
CREATE TABLE fleet_delegated_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID NOT NULL REFERENCES fleets(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to_driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(fleet_id, assigned_to_driver_id)
);

-- Enable RLS
ALTER TABLE fleet_delegated_roles ENABLE ROW LEVEL SECURITY;

-- Fleet users can manage their own delegated roles
CREATE POLICY "Fleet users can manage delegated roles"
ON fleet_delegated_roles
FOR ALL
USING (fleet_id = get_user_fleet_id(auth.uid()))
WITH CHECK (fleet_id = get_user_fleet_id(auth.uid()));

-- Drivers can view their delegated roles
CREATE POLICY "Drivers can view their delegated roles"
ON fleet_delegated_roles
FOR SELECT
USING (assigned_to_user_id = auth.uid());

-- Admin can manage all
CREATE POLICY "Admin can manage all delegated roles"
ON fleet_delegated_roles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_fleet_delegated_roles_updated_at
BEFORE UPDATE ON fleet_delegated_roles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
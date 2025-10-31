-- Create tab_permissions table for managing role-based tab visibility
CREATE TABLE IF NOT EXISTS public.tab_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  tab_id TEXT NOT NULL,
  parent_tab_id TEXT NULL,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, tab_id)
);

-- Enable RLS
ALTER TABLE public.tab_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can manage tab permissions
CREATE POLICY "Admins can manage tab permissions"
ON public.tab_permissions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their role's permissions
CREATE POLICY "Users can view their role permissions"
ON public.tab_permissions
FOR SELECT
USING (
  role IN (
    SELECT user_roles.role 
    FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid()
  )
);

-- Insert default permissions for admin (all tabs visible)
INSERT INTO public.tab_permissions (role, tab_id, is_visible) VALUES
('admin', 'weekly-report', true),
('admin', 'settlements', true),
('admin', 'drivers-list', true),
('admin', 'fleet', true),
('admin', 'fleet.vehicles', true),
('admin', 'fleet.fleets', true),
('admin', 'documents', true),
('admin', 'documents.list', true),
('admin', 'fleet-accounts', true),
('admin', 'user-roles', true),
('admin', 'plans', true),
('admin', 'tab-visibility', true),
('admin', 'data-import', true),
('admin', 'settings', true),
('admin', 'reports', true)
ON CONFLICT (role, tab_id) DO NOTHING;

-- Insert default permissions for fleet_rental (rental management)
INSERT INTO public.tab_permissions (role, tab_id, is_visible) VALUES
('fleet_rental', 'fleet', true),
('fleet_rental', 'fleet.vehicles', true),
('fleet_rental', 'fleet.fleets', false),
('fleet_rental', 'drivers-list', true),
('fleet_rental', 'documents', true),
('fleet_rental', 'documents.list', true),
('fleet_rental', 'reports', true)
ON CONFLICT (role, tab_id) DO NOTHING;

-- Insert default permissions for fleet_settlement (settlements only)
INSERT INTO public.tab_permissions (role, tab_id, is_visible) VALUES
('fleet_settlement', 'settlements', true),
('fleet_settlement', 'drivers-list', true),
('fleet_settlement', 'documents', true),
('fleet_settlement', 'documents.list', true),
('fleet_settlement', 'reports', true)
ON CONFLICT (role, tab_id) DO NOTHING;

-- Insert default permissions for driver (only settlements)
INSERT INTO public.tab_permissions (role, tab_id, is_visible) VALUES
('driver', 'settlements', true)
ON CONFLICT (role, tab_id) DO NOTHING;

-- Create updated_at trigger
CREATE TRIGGER update_tab_permissions_updated_at
BEFORE UPDATE ON public.tab_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
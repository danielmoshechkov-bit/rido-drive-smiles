-- Add missing "fleet" tab permission for fleet_settlement role
INSERT INTO tab_permissions (role, tab_id, is_visible)
VALUES 
  ('fleet_settlement', 'fleet', true),
  ('fleet_settlement', 'fleet.vehicles', true),
  ('fleet_settlement', 'fleet.fleets', false)
ON CONFLICT (role, tab_id) DO NOTHING;
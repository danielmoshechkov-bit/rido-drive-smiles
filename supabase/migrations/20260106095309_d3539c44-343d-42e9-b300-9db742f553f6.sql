-- Create helper function to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_marketplace_profile_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM marketplace_user_profiles WHERE user_id = p_user_id LIMIT 1
$$;

-- Drop problematic recursive policies
DROP POLICY IF EXISTS "Employees can view their company" ON marketplace_user_profiles;
DROP POLICY IF EXISTS "Business owners can manage employees" ON marketplace_user_profiles;

-- Recreate policies using the helper function
CREATE POLICY "Employees can view their company" 
ON marketplace_user_profiles FOR SELECT
USING (
  parent_company_id IS NOT NULL 
  AND parent_company_id = get_user_marketplace_profile_id(auth.uid())
);

CREATE POLICY "Business owners can manage employees"
ON marketplace_user_profiles FOR ALL
USING (
  parent_company_id = get_user_marketplace_profile_id(auth.uid())
);

-- Add new feature toggles for granular control
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled)
VALUES 
  ('marketplace_vehicles_enabled', 'Giełda aut', 'Pokazuje kategorię pojazdów w marketplace', false),
  ('marketplace_realestate_enabled', 'Nieruchomości', 'Pokazuje kategorię nieruchomości w marketplace', false),
  ('marketplace_services_enabled', 'Usługi', 'Pokazuje kategorię usług w marketplace', false),
  ('driver_registration_enabled', 'Rejestracja kierowców', 'Pozwala na rejestrację nowych kierowców przez marketplace', true)
ON CONFLICT (feature_key) DO NOTHING;
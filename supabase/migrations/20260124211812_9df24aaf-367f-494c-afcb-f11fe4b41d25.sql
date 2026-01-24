-- Update RLS policy to allow viewing 'active' providers (not just 'verified')
DROP POLICY IF EXISTS "Verified providers are public" ON service_providers;

CREATE POLICY "Active providers are public" 
ON service_providers 
FOR SELECT 
USING (
  (status IN ('active', 'verified')) 
  OR (user_id = auth.uid())
);

-- Also update services policy to show services from active providers
DROP POLICY IF EXISTS "Active services are public" ON services;

CREATE POLICY "Active services are public" 
ON services 
FOR SELECT 
USING (
  (is_active = true) 
  AND EXISTS (
    SELECT 1 FROM service_providers 
    WHERE service_providers.id = services.provider_id 
    AND service_providers.status IN ('active', 'verified')
  )
);
CREATE POLICY "Active provider services are public"
ON public.provider_services
FOR SELECT
USING (
  coalesce(is_active, true) = true
  AND EXISTS (
    SELECT 1
    FROM public.service_providers sp
    WHERE sp.id = provider_services.provider_id
      AND sp.status IN ('active', 'verified')
  )
);
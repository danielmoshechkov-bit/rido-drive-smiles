ALTER TABLE public.workshop_order_statuses
ADD COLUMN IF NOT EXISTS auto_trigger text DEFAULT NULL;

-- Also add a provider-level setting for auto/manual mode
CREATE TABLE IF NOT EXISTS public.workshop_status_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  status_mode text NOT NULL DEFAULT 'auto',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id)
);

ALTER TABLE public.workshop_status_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own status settings"
ON public.workshop_status_settings
FOR ALL
TO authenticated
USING (
  provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
)
WITH CHECK (
  provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
);
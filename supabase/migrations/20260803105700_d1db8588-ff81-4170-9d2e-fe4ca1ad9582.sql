CREATE TABLE IF NOT EXISTS public.provider_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  photo_url text,
  bio text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_staff TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_staff TO authenticated;
GRANT ALL ON public.provider_staff TO service_role;

ALTER TABLE public.provider_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active staff of active providers"
ON public.provider_staff FOR SELECT
USING (
  is_active = true AND EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = provider_staff.provider_id AND sp.status = 'active'
  )
);

CREATE POLICY "Owners manage their staff"
ON public.provider_staff FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_staff.provider_id AND sp.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_staff.provider_id AND sp.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_provider_staff_provider ON public.provider_staff(provider_id);
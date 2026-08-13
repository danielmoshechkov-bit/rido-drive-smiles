CREATE TABLE IF NOT EXISTS public.provider_service_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  cover_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_service_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_service_categories TO authenticated;
GRANT ALL ON public.provider_service_categories TO service_role;

ALTER TABLE public.provider_service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active provider categories are public"
ON public.provider_service_categories FOR SELECT
USING (
  COALESCE(is_active, true) = true
  AND EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = provider_service_categories.provider_id
      AND sp.status = ANY (ARRAY['active'::text, 'verified'::text])
  )
);

CREATE POLICY "Providers manage own service categories"
ON public.provider_service_categories FOR ALL
USING (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())))
WITH CHECK (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())));

CREATE INDEX IF NOT EXISTS idx_provider_service_categories_provider
  ON public.provider_service_categories(provider_id);

ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.provider_service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_provider_services_category
  ON public.provider_services(category_id);

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS working_hours JSONB NOT NULL DEFAULT '{}'::jsonb;
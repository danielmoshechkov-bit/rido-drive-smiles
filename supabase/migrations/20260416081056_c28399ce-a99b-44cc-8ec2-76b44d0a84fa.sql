
-- Add missing columns to workshop_tire_storage
ALTER TABLE public.workshop_tire_storage
ADD COLUMN IF NOT EXISTS client_name text,
ADD COLUMN IF NOT EXISTS client_phone text,
ADD COLUMN IF NOT EXISTS location_name text,
ADD COLUMN IF NOT EXISTS storage_cost numeric DEFAULT 150,
ADD COLUMN IF NOT EXISTS reminder_months integer DEFAULT 6,
ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rim_type text,
ADD COLUMN IF NOT EXISTS rim_manufacturer text,
ADD COLUMN IF NOT EXISTS pickup_deadline date,
ADD COLUMN IF NOT EXISTS employee_name text;

-- Service points table
CREATE TABLE IF NOT EXISTS public.workshop_service_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_service_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider manages own service points"
ON public.workshop_service_points
FOR ALL
USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- Tire storage tasks (per storage record)
CREATE TABLE IF NOT EXISTS public.workshop_tire_storage_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_id uuid NOT NULL REFERENCES public.workshop_tire_storage(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric DEFAULT 0,
  is_done boolean DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_tire_storage_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider manages tire storage tasks"
ON public.workshop_tire_storage_tasks
FOR ALL
USING (storage_id IN (
  SELECT id FROM public.workshop_tire_storage WHERE provider_id IN (
    SELECT id FROM public.service_providers WHERE user_id = auth.uid()
  )
))
WITH CHECK (storage_id IN (
  SELECT id FROM public.workshop_tire_storage WHERE provider_id IN (
    SELECT id FROM public.service_providers WHERE user_id = auth.uid()
  )
));


-- Workshop employees table
CREATE TABLE public.workshop_employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  hourly_rate NUMERIC,
  salary NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workshop_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own employees" ON public.workshop_employees
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  );

-- Service provider services table  
CREATE TABLE public.provider_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  price_from NUMERIC DEFAULT 0,
  price_to NUMERIC DEFAULT 0,
  category TEXT DEFAULT 'ogolne',
  is_active BOOLEAN DEFAULT true,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers manage own services" ON public.provider_services
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
  );

CREATE TRIGGER update_workshop_employees_updated_at
  BEFORE UPDATE ON public.workshop_employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_provider_services_updated_at
  BEFORE UPDATE ON public.provider_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

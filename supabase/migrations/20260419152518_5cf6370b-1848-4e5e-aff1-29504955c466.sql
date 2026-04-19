ALTER TABLE public.provider_services 
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
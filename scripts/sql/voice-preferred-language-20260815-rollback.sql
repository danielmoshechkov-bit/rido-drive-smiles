ALTER TABLE public.workshop_clients DROP CONSTRAINT IF EXISTS workshop_clients_preferred_language_check;
DROP INDEX IF EXISTS public.idx_workshop_clients_provider_phone;
ALTER TABLE public.workshop_clients DROP COLUMN IF EXISTS preferred_language;

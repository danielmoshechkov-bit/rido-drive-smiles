CREATE TABLE public.service_provider_nav_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  primary_tabs TEXT[] NOT NULL DEFAULT ARRAY['dashboard','services','workshop','calendar','ai-agent','account'],
  more_tabs TEXT[] NOT NULL DEFAULT ARRAY['workspace','website','settings'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (provider_id)
);

ALTER TABLE public.service_provider_nav_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service providers can view own nav preferences"
ON public.service_provider_nav_preferences
FOR SELECT
USING (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())));

CREATE POLICY "Service providers can insert own nav preferences"
ON public.service_provider_nav_preferences
FOR INSERT
WITH CHECK (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())));

CREATE POLICY "Service providers can update own nav preferences"
ON public.service_provider_nav_preferences
FOR UPDATE
USING (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())))
WITH CHECK (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())));

CREATE POLICY "Service providers can delete own nav preferences"
ON public.service_provider_nav_preferences
FOR DELETE
USING (provider_id IN (SELECT public.get_user_provider_ids(auth.uid())));

CREATE TRIGGER update_service_provider_nav_preferences_updated_at
BEFORE UPDATE ON public.service_provider_nav_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Admin-only secure settings table for sensitive values like bot tokens
CREATE TABLE IF NOT EXISTS public.secure_app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.secure_app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS secure_app_settings_admin_all ON public.secure_app_settings;
CREATE POLICY secure_app_settings_admin_all ON public.secure_app_settings
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Helper: returns true if telegram bot token is configured (callable by anyone authed)
CREATE OR REPLACE FUNCTION public.telegram_bot_token_is_set()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.secure_app_settings
    WHERE key = 'telegram_bot_token'
      AND COALESCE(length(value->>'token'), 0) > 0
  );
$$;

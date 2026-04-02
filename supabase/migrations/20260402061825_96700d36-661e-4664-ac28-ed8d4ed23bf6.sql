
CREATE TABLE IF NOT EXISTS public.ksef_alert_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ksef_alert_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ksef_alert_emails" ON public.ksef_alert_emails FOR SELECT USING (true);
CREATE POLICY "Admins can manage ksef_alert_emails" ON public.ksef_alert_emails FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Allow null user_id in ksef_monitor_alerts
ALTER TABLE public.ksef_monitor_alerts ALTER COLUMN user_id DROP NOT NULL;
-- Allow null user_id in ksef_monitor_scans
ALTER TABLE public.ksef_monitor_scans ALTER COLUMN user_id DROP NOT NULL;

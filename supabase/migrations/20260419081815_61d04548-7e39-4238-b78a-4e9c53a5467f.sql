-- Workshop SMS log: history + scheduled SMS unified
CREATE TABLE IF NOT EXISTS public.workshop_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid,
  appointment_id uuid,
  client_id uuid,
  phone text NOT NULL,
  message text NOT NULL,
  sms_type text,
  status text NOT NULL DEFAULT 'sent',
  scheduled_at timestamptz,
  sent_at timestamptz,
  error_message text,
  external_id text,
  parts_count integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_sms_log_provider ON public.workshop_sms_log(provider_id);
CREATE INDEX IF NOT EXISTS idx_workshop_sms_log_status ON public.workshop_sms_log(status);
CREATE INDEX IF NOT EXISTS idx_workshop_sms_log_scheduled ON public.workshop_sms_log(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_workshop_sms_log_order ON public.workshop_sms_log(order_id);

ALTER TABLE public.workshop_sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider owners can view their SMS log"
  ON public.workshop_sms_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = workshop_sms_log.provider_id AND sp.user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Provider owners can insert SMS log"
  ON public.workshop_sms_log FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = workshop_sms_log.provider_id AND sp.user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Provider owners can update their SMS log"
  ON public.workshop_sms_log FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = workshop_sms_log.provider_id AND sp.user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Provider owners can delete scheduled SMS"
  ON public.workshop_sms_log FOR DELETE
  USING (
    (status = 'scheduled')
    AND (
      EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = workshop_sms_log.provider_id AND sp.user_id = auth.uid())
      OR user_id = auth.uid()
    )
  );

-- Service role full access (for edge functions)
CREATE POLICY "Service role can manage all SMS log"
  ON public.workshop_sms_log FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE OR REPLACE TRIGGER trg_workshop_sms_log_updated
  BEFORE UPDATE ON public.workshop_sms_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
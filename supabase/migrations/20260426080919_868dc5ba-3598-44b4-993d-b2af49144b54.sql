-- =====================================================
-- 1) EXTERNAL LEAD SOURCES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.external_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'google_sheets','telegram_bot','webhook','csv_import','zapier','make'
  )),
  source_name TEXT NOT NULL,
  -- Google Sheets
  sheets_spreadsheet_id TEXT,
  sheets_tab_name TEXT DEFAULT 'Arkusz1',
  sheets_last_row_imported INTEGER DEFAULT 1,
  sheets_column_mapping JSONB DEFAULT '{"0":"name","1":"phone","2":"email","3":"city","4":"message"}'::jsonb,
  sheets_access_token TEXT,
  sheets_refresh_token TEXT,
  -- Telegram
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  telegram_last_update_id BIGINT DEFAULT 0,
  -- Webhook
  webhook_url TEXT,
  webhook_secret TEXT DEFAULT encode(gen_random_bytes(24), 'hex'),
  -- Settings
  is_active BOOLEAN DEFAULT true,
  sync_interval_minutes INTEGER DEFAULT 15,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_message TEXT,
  total_imported INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_els_client ON public.external_lead_sources(client_id);
CREATE INDEX IF NOT EXISTS idx_els_owner ON public.external_lead_sources(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_els_active_type ON public.external_lead_sources(is_active, source_type);

ALTER TABLE public.external_lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own external sources"
  ON public.external_lead_sources FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Admins manage all external sources"
  ON public.external_lead_sources FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Service role full access external sources"
  ON public.external_lead_sources FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Auto webhook_url generation
CREATE OR REPLACE FUNCTION public.set_external_source_webhook_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.webhook_url IS NULL THEN
    NEW.webhook_url := 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/external-lead-webhook?source_id=' || NEW.id::text || '&secret=' || NEW.webhook_secret;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_external_source_webhook_url
  BEFORE INSERT ON public.external_lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_external_source_webhook_url();

CREATE TRIGGER trg_external_sources_updated
  BEFORE UPDATE ON public.external_lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2) LEAD IMPORT LOGS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lead_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.external_lead_sources(id) ON DELETE CASCADE,
  imported_at TIMESTAMPTZ DEFAULT now(),
  leads_found INTEGER DEFAULT 0,
  leads_imported INTEGER DEFAULT 0,
  leads_skipped INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_lil_source ON public.lead_import_logs(source_id, imported_at DESC);

ALTER TABLE public.lead_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own import logs"
  ON public.lead_import_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.external_lead_sources s
    WHERE s.id = source_id AND s.owner_user_id = auth.uid()
  ));

CREATE POLICY "Service role manages import logs"
  ON public.lead_import_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Admins read all import logs"
  ON public.lead_import_logs FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role));

-- =====================================================
-- 3) CALL QUEUE (manual obdzwanianie)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_to_call TEXT NOT NULL,
  lead_name TEXT,
  ai_score INTEGER,
  ai_priority TEXT CHECK (ai_priority IN ('hot','warm','cold')),
  ai_script JSONB,
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued','calling','answered','no_answer','voicemail','callback','converted','do_not_call'
  )),
  scheduled_for TIMESTAMPTZ DEFAULT now(),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  call_duration_seconds INTEGER,
  call_outcome TEXT,
  agent_notes TEXT,
  appointment_booked BOOLEAN DEFAULT false,
  voip_call_id TEXT,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cq_owner_status ON public.call_queue(owner_user_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_cq_lead ON public.call_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_cq_priority ON public.call_queue(ai_priority, scheduled_for);

ALTER TABLE public.call_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own call queue"
  ON public.call_queue FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Admins manage all call queue"
  ON public.call_queue FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Service role full access call queue"
  ON public.call_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TRIGGER trg_call_queue_updated
  BEFORE UPDATE ON public.call_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4) CALL LOGS (manual obdzwanianie)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.call_queue(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.marketing_leads(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  outcome TEXT,
  notes TEXT,
  called_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cl_owner ON public.call_logs(owner_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cl_lead ON public.call_logs(lead_id);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own call logs"
  ON public.call_logs FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Admins manage all call logs"
  ON public.call_logs FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Service role full access call logs"
  ON public.call_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
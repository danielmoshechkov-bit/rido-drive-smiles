-- Add ElevenLabs as AI provider
INSERT INTO ai_providers (provider_key, display_name, is_enabled, default_model, timeout_seconds, admin_note)
VALUES ('elevenlabs', 'ElevenLabs', false, 'scribe_v2', 60, 'STT/TTS - transkrypcja audio i synteza mowy. Wymagany klucz API z elevenlabs.io')
ON CONFLICT DO NOTHING;

-- Add STT routing rule
INSERT INTO ai_routing_rules (task_type, primary_provider_key, allow_fallback)
VALUES ('stt', 'lovable', true)
ON CONFLICT DO NOTHING;

-- Add TTS routing rule
INSERT INTO ai_routing_rules (task_type, primary_provider_key, allow_fallback)
VALUES ('tts', 'elevenlabs', true)
ON CONFLICT DO NOTHING;

-- ============================
-- RIDO MAIL - Email accounts
-- ============================
CREATE TABLE public.email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  provider TEXT NOT NULL DEFAULT 'imap',
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  username TEXT,
  encrypted_password TEXT,
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  sync_interval_minutes INTEGER DEFAULT 15,
  auto_reply_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email accounts" ON public.email_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================
-- RIDO MAIL - Emails
-- ============================
CREATE TABLE public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.email_accounts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  message_id TEXT,
  subject TEXT,
  from_address TEXT,
  from_name TEXT,
  to_addresses TEXT[],
  cc_addresses TEXT[],
  body_text TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  is_spam BOOLEAN DEFAULT false,
  folder TEXT DEFAULT 'inbox',
  -- AI analysis fields
  ai_summary TEXT,
  ai_priority TEXT DEFAULT 'normal',
  ai_category TEXT,
  ai_action_items JSONB,
  ai_suggested_replies JSONB,
  ai_analyzed_at TIMESTAMPTZ,
  has_attachments BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own emails" ON public.emails
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_emails_account ON public.emails(account_id);
CREATE INDEX idx_emails_user ON public.emails(user_id);
CREATE INDEX idx_emails_received ON public.emails(received_at DESC);
CREATE INDEX idx_emails_priority ON public.emails(ai_priority);

-- ============================
-- RIDO MAIL - Email drafts
-- ============================
CREATE TABLE public.email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  reply_to_email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
  to_addresses TEXT[],
  cc_addresses TEXT[],
  subject TEXT,
  body TEXT,
  ai_generated BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drafts" ON public.email_drafts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_drafts_updated_at
  BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
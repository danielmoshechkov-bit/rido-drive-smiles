-- Company AI settings (per user/company)
CREATE TABLE IF NOT EXISTS public.company_ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
  default_text_provider TEXT DEFAULT 'openai',
  default_voice_provider TEXT DEFAULT 'openai',
  voice_replies_enabled BOOLEAN DEFAULT false,
  voice_name TEXT DEFAULT 'alloy',
  speech_speed NUMERIC DEFAULT 1.0,
  allow_provider_switch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for company_ai_settings
ALTER TABLE public.company_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI settings"
  ON public.company_ai_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI settings"
  ON public.company_ai_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI settings"
  ON public.company_ai_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Contractor verification logs
CREATE TABLE IF NOT EXISTS public.contractor_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.invoice_recipients(id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL, -- gus, whitelist, vies
  nip TEXT,
  result JSONB,
  is_valid BOOLEAN,
  verified_at TIMESTAMPTZ DEFAULT now(),
  verified_by UUID REFERENCES auth.users(id)
);

-- RLS for contractor_verification_logs
ALTER TABLE public.contractor_verification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view verification logs"
  ON public.contractor_verification_logs FOR SELECT
  USING (true);

CREATE POLICY "Users can insert verification logs"
  ON public.contractor_verification_logs FOR INSERT
  WITH CHECK (auth.uid() = verified_by);

-- Autofactoring agreements (versioned consent)
CREATE TABLE IF NOT EXISTS public.autofactoring_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  agreement_version TEXT DEFAULT '1.0',
  accepted_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ
);

-- RLS for autofactoring_agreements
ALTER TABLE public.autofactoring_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agreements"
  ON public.autofactoring_agreements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agreements"
  ON public.autofactoring_agreements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agreements"
  ON public.autofactoring_agreements FOR UPDATE
  USING (auth.uid() = user_id);

-- Voice phrase cache (TTS cost optimization)
CREATE TABLE IF NOT EXISTS public.voice_phrase_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase_hash TEXT UNIQUE NOT NULL,
  phrase_text TEXT NOT NULL,
  audio_url TEXT,
  provider TEXT DEFAULT 'openai',
  voice_name TEXT DEFAULT 'alloy',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for voice_phrase_cache (public read for caching)
ALTER TABLE public.voice_phrase_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read voice cache"
  ON public.voice_phrase_cache FOR SELECT
  USING (true);

CREATE POLICY "System can insert voice cache"
  ON public.voice_phrase_cache FOR INSERT
  WITH CHECK (true);

-- Add verification fields to invoice_recipients
ALTER TABLE public.invoice_recipients 
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gus_data JSONB,
  ADD COLUMN IF NOT EXISTS whitelist_data JSONB;

-- AI conversation sessions (for context management)
CREATE TABLE IF NOT EXISTS public.ai_conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT DEFAULT 'general', -- general, invoice, marketplace, support
  messages JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  pending_action JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for ai_conversation_sessions
ALTER TABLE public.ai_conversation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sessions"
  ON public.ai_conversation_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_voice_phrase_hash ON public.voice_phrase_cache(phrase_hash);
CREATE INDEX IF NOT EXISTS idx_contractor_verification_recipient ON public.contractor_verification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON public.ai_conversation_sessions(user_id);

-- Marketing Agency module tables

-- Agency settings (singleton per portal)
CREATE TABLE public.agency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name text DEFAULT 'GetRido Marketing',
  agency_logo_url text,
  contact_email text,
  contact_phone text,
  anthropic_api_key_encrypted text,
  gemini_api_key_encrypted text,
  meta_app_id_encrypted text,
  meta_app_secret_encrypted text,
  google_client_id_encrypted text,
  google_client_secret_encrypted text,
  roas_stop_threshold numeric DEFAULT 1.5,
  roas_boost_threshold numeric DEFAULT 4.0,
  max_boost_percent numeric DEFAULT 30,
  report_email text,
  report_branding jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage agency_settings" ON public.agency_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Agency clients
CREATE TABLE public.agency_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_email text,
  contact_name text,
  logo_url text,
  notes text,
  added_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agency_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read agency_clients" ON public.agency_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage agency_clients" ON public.agency_clients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- API connections (for GetRido own + client accounts)
CREATE TABLE public.agency_api_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_type text NOT NULL CHECK (connection_type IN ('meta','google')),
  account_type text NOT NULL CHECK (account_type IN ('getrido','client')),
  client_id uuid REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  encrypted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','error')),
  last_synced_at timestamptz,
  error_message text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agency_api_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read agency_api_connections" ON public.agency_api_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage agency_api_connections" ON public.agency_api_connections FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Campaigns
CREATE TABLE public.agency_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('meta','google')),
  client_id uuid REFERENCES public.agency_clients(id),
  external_campaign_id text,
  name text NOT NULL,
  daily_budget numeric DEFAULT 0,
  spend_today numeric DEFAULT 0,
  roas_current numeric,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  data jsonb DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agency_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read agency_campaigns" ON public.agency_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage agency_campaigns" ON public.agency_campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Ad creatives
CREATE TABLE public.agency_ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.agency_clients(id),
  platform text,
  brief jsonb DEFAULT '{}'::jsonb,
  variants jsonb DEFAULT '[]'::jsonb,
  image_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agency_ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read agency_ad_creatives" ON public.agency_ad_creatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage agency_ad_creatives" ON public.agency_ad_creatives FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Invitations
CREATE TABLE public.agency_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('marketing_manager','client_viewer')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled')),
  invited_by uuid REFERENCES auth.users(id),
  client_id uuid REFERENCES public.agency_clients(id),
  token text UNIQUE DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE public.agency_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read agency_invitations" ON public.agency_invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage agency_invitations" ON public.agency_invitations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Marketing agent conversations
CREATE TABLE public.marketing_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.marketing_agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own marketing conversations" ON public.marketing_agent_conversations FOR ALL TO authenticated USING (user_id = auth.uid());

-- Marketing agent messages
CREATE TABLE public.marketing_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.marketing_agent_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.marketing_agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own marketing messages" ON public.marketing_agent_messages FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.marketing_agent_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);

-- Add marketing_manager to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing_manager';

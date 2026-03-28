-- Viewing requests & slots for real estate portal
CREATE TABLE IF NOT EXISTS viewing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_start_address TEXT,
  listing_ids UUID[],
  preferred_dates JSONB DEFAULT '[]',
  viewing_duration_minutes INTEGER DEFAULT 60,
  prefer_one_day BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending',
  final_plan JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS viewing_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES viewing_requests(id) ON DELETE CASCADE,
  listing_id UUID,
  agent_id UUID,
  agent_email TEXT,
  agent_phone TEXT,
  confirmation_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  proposed_slots JSONB DEFAULT '[]',
  agent_confirmed_slots JSONB DEFAULT '[]',
  status TEXT DEFAULT 'awaiting',
  email_sent_at TIMESTAMPTZ,
  sms_sent_at TIMESTAMPTZ,
  agent_responded_at TIMESTAMPTZ,
  reminder_1h_sent_at TIMESTAMPTZ,
  reminder_3h_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_calendar_tokens (
  agent_id UUID PRIMARY KEY,
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_calendar_id TEXT DEFAULT 'primary',
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE viewing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewing_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create viewing requests" ON viewing_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can view own viewing requests" ON viewing_requests FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "Admins can view all viewing requests" ON viewing_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view slots by token" ON viewing_slots FOR SELECT USING (true);
CREATE POLICY "Anyone can update slots by token" ON viewing_slots FOR UPDATE USING (true);
CREATE POLICY "Admins manage viewing slots" ON viewing_slots FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agent manages own calendar" ON agent_calendar_tokens FOR ALL TO authenticated USING (true);
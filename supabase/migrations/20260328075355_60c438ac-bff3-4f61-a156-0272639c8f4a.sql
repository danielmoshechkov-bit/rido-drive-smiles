CREATE TABLE public.property_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_agent_id uuid NOT NULL,
  recipient_email text,
  sender_name text,
  sender_email text,
  sender_phone text,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  parent_message_id uuid REFERENCES public.property_messages(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.property_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sent messages" ON public.property_messages
  FOR SELECT TO authenticated
  USING (sender_user_id = auth.uid());

CREATE POLICY "Agents can read messages for their listings" ON public.property_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM real_estate_listings rel
      WHERE rel.id = property_messages.listing_id
      AND rel.agent_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can send messages" ON public.property_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

CREATE POLICY "Agents can update their messages" ON public.property_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM real_estate_listings rel
      WHERE rel.id = property_messages.listing_id
      AND rel.agent_id = auth.uid()
    )
  );
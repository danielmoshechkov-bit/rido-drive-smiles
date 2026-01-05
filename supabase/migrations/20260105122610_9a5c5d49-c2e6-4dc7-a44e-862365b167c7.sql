-- Add marketplace_user role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'marketplace_user';

-- Create marketplace user profiles table (separate from drivers)
CREATE TABLE IF NOT EXISTS public.marketplace_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Basic info (required at registration)
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  city_id UUID REFERENCES cities(id),
  
  -- Account mode (set when user wants to sell)
  account_mode TEXT NOT NULL DEFAULT 'buyer', -- 'buyer', 'private_seller', 'business'
  
  -- Business info (filled if account_mode = 'business')
  company_name TEXT,
  company_nip TEXT,
  company_regon TEXT,
  company_address TEXT,
  company_city TEXT,
  company_postal_code TEXT,
  company_website TEXT,
  
  -- Public contact (can differ from personal)
  public_phone TEXT,
  public_email TEXT,
  
  -- For employees of business accounts
  parent_company_id UUID REFERENCES marketplace_user_profiles(id),
  employee_permissions JSONB DEFAULT '{}',
  
  -- User preferences (system learns)
  default_category TEXT,
  preferred_listing_type TEXT,
  
  -- Stats
  listings_count INTEGER DEFAULT 0,
  avg_rating NUMERIC(3,2),
  reviews_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create marketplace conversations table
CREATE TABLE IF NOT EXISTS public.marketplace_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  buyer_profile_id UUID REFERENCES marketplace_user_profiles(id) ON DELETE CASCADE,
  seller_profile_id UUID REFERENCES marketplace_user_profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  buyer_unread_count INTEGER DEFAULT 0,
  seller_unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create marketplace messages table
CREATE TABLE IF NOT EXISTS public.marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
  sender_profile_id UUID REFERENCES marketplace_user_profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketplace_user_profiles
CREATE POLICY "Users can view their own profile"
ON public.marketplace_user_profiles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.marketplace_user_profiles FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.marketplace_user_profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Public profiles are viewable"
ON public.marketplace_user_profiles FOR SELECT
USING (account_mode IN ('private_seller', 'business'));

CREATE POLICY "Employees can view their company"
ON public.marketplace_user_profiles FOR SELECT
USING (id IN (
  SELECT parent_company_id FROM marketplace_user_profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Business owners can manage employees"
ON public.marketplace_user_profiles FOR ALL
USING (parent_company_id IN (
  SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid() AND account_mode = 'business'
));

CREATE POLICY "Admins can manage all profiles"
ON public.marketplace_user_profiles FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for conversations
CREATE POLICY "Users can view their conversations"
ON public.marketplace_conversations FOR SELECT
USING (
  buyer_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
  OR seller_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can create conversations"
ON public.marketplace_conversations FOR INSERT
WITH CHECK (
  buyer_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their conversations"
ON public.marketplace_conversations FOR UPDATE
USING (
  buyer_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
  OR seller_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
);

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
ON public.marketplace_messages FOR SELECT
USING (
  conversation_id IN (
    SELECT id FROM marketplace_conversations 
    WHERE buyer_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
    OR seller_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can send messages in their conversations"
ON public.marketplace_messages FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT id FROM marketplace_conversations 
    WHERE buyer_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
    OR seller_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
  )
  AND sender_profile_id IN (SELECT id FROM marketplace_user_profiles WHERE user_id = auth.uid())
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_user_id ON marketplace_user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_profiles_parent ON marketplace_user_profiles(parent_company_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_conversations_buyer ON marketplace_conversations(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_conversations_seller ON marketplace_conversations(seller_profile_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_conversation ON marketplace_messages(conversation_id);

-- Update function for updated_at
CREATE OR REPLACE FUNCTION update_marketplace_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_marketplace_profile_timestamp
BEFORE UPDATE ON marketplace_user_profiles
FOR EACH ROW EXECUTE FUNCTION update_marketplace_profile_updated_at();
-- Insurance Agent Module: tables for agents, offers, and notifications

-- Create insurance_agents table
CREATE TABLE public.insurance_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  nip TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  license_number TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_insurance_agent_user UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.insurance_agents ENABLE ROW LEVEL SECURITY;

-- Policies for insurance_agents
CREATE POLICY "Agents can view their own profile"
  ON public.insurance_agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Agents can update their own profile"
  ON public.insurance_agents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Agents can insert their own profile"
  ON public.insurance_agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all agents"
  ON public.insurance_agents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );

-- Create insurance_offers table
CREATE TABLE public.insurance_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.insurance_agents(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE SET NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('OC', 'AC', 'OC+AC')),
  current_premium NUMERIC(10,2),
  offer_premium NUMERIC(10,2) NOT NULL,
  offer_details TEXT,
  valid_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'accepted', 'rejected', 'contact_requested')),
  fleet_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  viewed_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.insurance_offers ENABLE ROW LEVEL SECURITY;

-- Policies for insurance_offers
CREATE POLICY "Agents can view their own offers"
  ON public.insurance_offers FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM public.insurance_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agents can create offers"
  ON public.insurance_offers FOR INSERT
  WITH CHECK (
    agent_id IN (
      SELECT id FROM public.insurance_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agents can update their own offers"
  ON public.insurance_offers FOR UPDATE
  USING (
    agent_id IN (
      SELECT id FROM public.insurance_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Fleet owners can view offers for their vehicles"
  ON public.insurance_offers FOR SELECT
  USING (
    fleet_id IN (
      SELECT fleet_id FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.fleet_id IS NOT NULL
    )
    OR
    vehicle_id IN (
      SELECT v.id FROM public.vehicles v
      JOIN public.driver_vehicle_assignments dva ON dva.vehicle_id = v.id
      JOIN public.driver_app_users dau ON dau.driver_id = dva.driver_id
      WHERE dau.user_id = auth.uid() AND dva.status = 'active' AND v.fleet_id IS NULL
    )
  );

CREATE POLICY "Fleet owners can update offer status"
  ON public.insurance_offers FOR UPDATE
  USING (
    fleet_id IN (
      SELECT fleet_id FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.fleet_id IS NOT NULL
    )
    OR
    vehicle_id IN (
      SELECT v.id FROM public.vehicles v
      JOIN public.driver_vehicle_assignments dva ON dva.vehicle_id = v.id
      JOIN public.driver_app_users dau ON dau.driver_id = dva.driver_id
      WHERE dau.user_id = auth.uid() AND dva.status = 'active' AND v.fleet_id IS NULL
    )
  );

-- Create insurance_notifications table
CREATE TABLE public.insurance_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES public.insurance_agents(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.vehicle_policies(id) ON DELETE SET NULL,
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('policy_expiring_30d', 'policy_expiring_7d', 'policy_expiring_1d')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'read', 'offer_sent')),
  policy_type TEXT,
  current_premium NUMERIC(10,2),
  expiry_date DATE NOT NULL,
  vehicle_plate TEXT,
  vehicle_vin TEXT,
  vehicle_brand TEXT,
  vehicle_model TEXT,
  fleet_name TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.insurance_notifications ENABLE ROW LEVEL SECURITY;

-- Policies for insurance_notifications
CREATE POLICY "Agents can view notifications"
  ON public.insurance_notifications FOR SELECT
  USING (
    agent_id IS NULL OR agent_id IN (
      SELECT id FROM public.insurance_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agents can update notification status"
  ON public.insurance_notifications FOR UPDATE
  USING (
    agent_id IN (
      SELECT id FROM public.insurance_agents WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all notifications"
  ON public.insurance_notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );

-- Add premium column to vehicle_policies if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'vehicle_policies' 
    AND column_name = 'premium'
  ) THEN
    ALTER TABLE public.vehicle_policies ADD COLUMN premium NUMERIC(10,2);
  END IF;
END $$;

-- Create updated_at trigger for insurance_agents
CREATE TRIGGER update_insurance_agents_updated_at
  BEFORE UPDATE ON public.insurance_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_insurance_offers_agent_id ON public.insurance_offers(agent_id);
CREATE INDEX idx_insurance_offers_vehicle_id ON public.insurance_offers(vehicle_id);
CREATE INDEX idx_insurance_offers_fleet_id ON public.insurance_offers(fleet_id);
CREATE INDEX idx_insurance_offers_status ON public.insurance_offers(status);
CREATE INDEX idx_insurance_notifications_agent_id ON public.insurance_notifications(agent_id);
CREATE INDEX idx_insurance_notifications_status ON public.insurance_notifications(status);
CREATE INDEX idx_insurance_notifications_expiry ON public.insurance_notifications(expiry_date);
-- Table for price change notifications
CREATE TABLE public.price_change_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  old_price NUMERIC NOT NULL,
  new_price NUMERIC NOT NULL,
  changed_by UUID,
  is_read BOOLEAN DEFAULT false,
  is_accepted BOOLEAN DEFAULT false,
  accepted_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_change_notifications ENABLE ROW LEVEL SECURITY;

-- Drivers can view their notifications
CREATE POLICY "Drivers can view their price notifications"
ON public.price_change_notifications FOR SELECT
USING (
  driver_id IN (
    SELECT dau.driver_id FROM driver_app_users dau WHERE dau.user_id = auth.uid()
  )
);

-- Drivers can update their notifications (to accept)
CREATE POLICY "Drivers can update their price notifications"
ON public.price_change_notifications FOR UPDATE
USING (
  driver_id IN (
    SELECT dau.driver_id FROM driver_app_users dau WHERE dau.user_id = auth.uid()
  )
);

-- Admins can manage all
CREATE POLICY "Admins can manage price notifications"
ON public.price_change_notifications FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fleet and drivers can insert notifications when price changes
CREATE POLICY "Authenticated users can insert price notifications"
ON public.price_change_notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
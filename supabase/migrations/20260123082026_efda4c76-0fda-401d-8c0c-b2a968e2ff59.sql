-- Create table for fleet payment notifications
CREATE TABLE IF NOT EXISTS public.fleet_payment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
  reminder_id UUID REFERENCES rental_payment_reminders(id) ON DELETE CASCADE,
  notification_type TEXT DEFAULT 'payment_due',
  status TEXT DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fleet_payment_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Fleet users can view their notifications"
ON public.fleet_payment_notifications
FOR SELECT
USING (true);

CREATE POLICY "Fleet users can update their notifications"
ON public.fleet_payment_notifications
FOR UPDATE
USING (true);

CREATE POLICY "System can insert notifications"
ON public.fleet_payment_notifications
FOR INSERT
WITH CHECK (true);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fleet_payment_notifications_fleet_id ON fleet_payment_notifications(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_payment_notifications_status ON fleet_payment_notifications(status);

-- Add upcoming_reminder_sent column to track 3-day reminders
ALTER TABLE public.rental_payment_reminders 
ADD COLUMN IF NOT EXISTS upcoming_reminder_sent BOOLEAN DEFAULT false;

-- Add fleet_notified column to track fleet notifications
ALTER TABLE public.rental_payment_reminders 
ADD COLUMN IF NOT EXISTS fleet_notified BOOLEAN DEFAULT false;

-- Config for invoice email inbox per provider
CREATE TABLE IF NOT EXISTS public.invoice_email_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active boolean DEFAULT true,
  last_check_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoice_email_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email configs" ON public.invoice_email_configs
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notifications for incoming invoices
CREATE TABLE IF NOT EXISTS public.invoice_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invoice_id uuid REFERENCES public.user_invoices(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  notification_type text DEFAULT 'new_invoice',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.invoice_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.invoice_notifications
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add source tracking to user_invoices
ALTER TABLE public.user_invoices ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE public.user_invoices ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'confirmed';
ALTER TABLE public.user_invoices ADD COLUMN IF NOT EXISTS sender_email text;
ALTER TABLE public.user_invoices ADD COLUMN IF NOT EXISTS received_at timestamptz;

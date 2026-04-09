
ALTER TABLE public.workshop_orders 
  ADD COLUMN IF NOT EXISTS estimate_sent_to_client boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimate_changed_after_send boolean DEFAULT false;

ALTER TABLE public.workshop_orders 
  ADD COLUMN IF NOT EXISTS mechanic_parts jsonb,
  ADD COLUMN IF NOT EXISTS mechanic_notes text;
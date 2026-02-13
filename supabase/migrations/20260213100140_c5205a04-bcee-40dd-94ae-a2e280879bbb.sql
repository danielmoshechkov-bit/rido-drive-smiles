
-- Add is_paid column to settlements for payment tracking persistence
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Add email field to vehicle_owners (phone and bank_account already exist)
ALTER TABLE public.vehicle_owners ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.vehicle_owners ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'przelew';

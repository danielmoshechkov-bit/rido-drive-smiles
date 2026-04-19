ALTER TABLE public.workshop_orders ADD COLUMN IF NOT EXISTS booking_id uuid;
CREATE INDEX IF NOT EXISTS idx_workshop_orders_booking_id ON public.workshop_orders(booking_id);
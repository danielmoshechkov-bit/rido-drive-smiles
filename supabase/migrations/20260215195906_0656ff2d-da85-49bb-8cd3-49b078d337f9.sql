
-- Add missing columns to workshop_orders for full order detail
ALTER TABLE public.workshop_orders 
ADD COLUMN IF NOT EXISTS mileage integer,
ADD COLUMN IF NOT EXISTS fuel_level text,
ADD COLUMN IF NOT EXISTS start_date date,
ADD COLUMN IF NOT EXISTS pickup_date date,
ADD COLUMN IF NOT EXISTS worker text,
ADD COLUMN IF NOT EXISTS mechanic_notes text,
ADD COLUMN IF NOT EXISTS post_completion_notes text,
ADD COLUMN IF NOT EXISTS damage_description text,
ADD COLUMN IF NOT EXISTS reception_protocol boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS client_acceptance_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS quote_accepted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ready_notification_sent boolean DEFAULT false;

-- Add cost column to workshop_order_items (our cost vs client price)
ALTER TABLE public.workshop_order_items
ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'task',
ADD COLUMN IF NOT EXISTS unit_cost_net numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_cost_gross numeric DEFAULT 0;

-- Add extra fields to workshop_clients
ALTER TABLE public.workshop_clients
ADD COLUMN IF NOT EXISTS country text DEFAULT 'Polska',
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS payment_term text,
ADD COLUMN IF NOT EXISTS default_vehicle_id uuid REFERENCES public.workshop_vehicles(id),
ADD COLUMN IF NOT EXISTS service_discount_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS goods_discount_percent numeric DEFAULT 0;

-- Create table for order photos (vehicle reception photos)
CREATE TABLE IF NOT EXISTS public.workshop_order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.workshop_orders(id) ON DELETE CASCADE NOT NULL,
  photo_url text NOT NULL,
  photo_type text DEFAULT 'reception',
  label text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workshop_order_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage order photos" ON public.workshop_order_photos
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workshop_orders wo
    JOIN public.service_providers sp ON sp.id = wo.provider_id
    WHERE wo.id = workshop_order_photos.order_id
    AND sp.user_id = auth.uid()
  )
);

-- Create table for order files/attachments
CREATE TABLE IF NOT EXISTS public.workshop_order_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.workshop_orders(id) ON DELETE CASCADE NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workshop_order_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider can manage order files" ON public.workshop_order_files
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.workshop_orders wo
    JOIN public.service_providers sp ON sp.id = wo.provider_id
    WHERE wo.id = workshop_order_files.order_id
    AND sp.user_id = auth.uid()
  )
);


-- ai_photo_orders table
CREATE TABLE public.ai_photo_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.general_listings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users NOT NULL,
  photos_count integer NOT NULL,
  amount numeric(6,2) NOT NULL DEFAULT 5.00,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','processing','completed','failed')),
  processed_photos jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_photo_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ai_photo_orders" ON public.ai_photo_orders
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Add is_protected column to general_listing_photos
ALTER TABLE public.general_listing_photos ADD COLUMN IF NOT EXISTS is_protected boolean DEFAULT false;

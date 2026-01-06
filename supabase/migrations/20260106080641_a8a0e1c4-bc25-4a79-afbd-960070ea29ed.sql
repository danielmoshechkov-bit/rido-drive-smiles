-- Create marketplace_ad_slots table for admin-managed advertisements
CREATE TABLE IF NOT EXISTS public.marketplace_ad_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_ad_slots ENABLE ROW LEVEL SECURITY;

-- Public can view active ads
CREATE POLICY "Anyone can view active ad slots"
ON public.marketplace_ad_slots
FOR SELECT
USING (is_active = true);

-- Only admins can manage ad slots
CREATE POLICY "Admins can manage ad slots"
ON public.marketplace_ad_slots
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Insert default ad slot placeholders
INSERT INTO public.marketplace_ad_slots (slot_key, name, description)
VALUES 
  ('search_below', 'Pod wyszukiwarką', 'Baner reklamowy wyświetlany pod główną wyszukiwarką'),
  ('sidebar', 'Boczny panel', 'Reklama w bocznym panelu filtrów');

-- Add expires_at and related fields to marketplace_listings
ALTER TABLE public.marketplace_listings 
ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create trigger for updated_at on ad_slots
CREATE TRIGGER update_marketplace_ad_slots_updated_at
BEFORE UPDATE ON public.marketplace_ad_slots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
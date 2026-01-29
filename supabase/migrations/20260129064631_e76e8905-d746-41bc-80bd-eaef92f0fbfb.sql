-- Table for promotion pricing configuration (admin managed)
CREATE TABLE public.promotion_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('vehicle', 'property', 'service')),
  placement TEXT NOT NULL CHECK (placement IN ('homepage', 'category')),
  duration_days INTEGER NOT NULL DEFAULT 7,
  price_pln NUMERIC(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(listing_type, placement, duration_days)
);

-- Table for active promotions on listings
CREATE TABLE public.listing_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('vehicle', 'property', 'service')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  placement TEXT NOT NULL CHECK (placement IN ('homepage', 'category')),
  price_paid NUMERIC(10, 2) NOT NULL,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promotion_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_promotions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotion_pricing (read-only for everyone, write for admins)
CREATE POLICY "Anyone can view active pricing" ON public.promotion_pricing
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage pricing" ON public.promotion_pricing
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for listing_promotions
CREATE POLICY "Users can view their own promotions" ON public.listing_promotions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create promotions" ON public.listing_promotions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all promotions" ON public.listing_promotions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all promotions" ON public.listing_promotions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_promotion_pricing_updated_at
  BEFORE UPDATE ON public.promotion_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listing_promotions_updated_at
  BEFORE UPDATE ON public.listing_promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_listing_promotions_listing ON public.listing_promotions(listing_id, listing_type);
CREATE INDEX idx_listing_promotions_active ON public.listing_promotions(is_active, expires_at) WHERE is_active = true;
CREATE INDEX idx_listing_promotions_placement ON public.listing_promotions(placement, is_active);

-- Insert default pricing options
INSERT INTO public.promotion_pricing (listing_type, placement, duration_days, price_pln) VALUES
  ('vehicle', 'homepage', 7, 29.99),
  ('vehicle', 'homepage', 14, 49.99),
  ('vehicle', 'homepage', 30, 89.99),
  ('vehicle', 'category', 7, 19.99),
  ('vehicle', 'category', 14, 34.99),
  ('vehicle', 'category', 30, 59.99),
  ('property', 'homepage', 7, 39.99),
  ('property', 'homepage', 14, 69.99),
  ('property', 'homepage', 30, 119.99),
  ('property', 'category', 7, 29.99),
  ('property', 'category', 14, 49.99),
  ('property', 'category', 30, 89.99),
  ('service', 'homepage', 7, 24.99),
  ('service', 'homepage', 14, 44.99),
  ('service', 'homepage', 30, 79.99),
  ('service', 'category', 7, 14.99),
  ('service', 'category', 14, 24.99),
  ('service', 'category', 30, 44.99);
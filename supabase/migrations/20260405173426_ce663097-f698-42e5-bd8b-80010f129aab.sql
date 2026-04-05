
-- Cart items
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id uuid REFERENCES public.general_listings(id) ON DELETE CASCADE NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_items_owner_all" ON public.cart_items FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- User wishlists
CREATE TABLE IF NOT EXISTS public.user_wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id uuid REFERENCES public.general_listings(id) ON DELETE CASCADE NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);
ALTER TABLE public.user_wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wishlists_owner_all" ON public.user_wishlists FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Listing reviews
CREATE TABLE IF NOT EXISTS public.listing_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  seller_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id uuid REFERENCES public.general_listings(id) ON DELETE SET NULL,
  score_contact integer NOT NULL CHECK (score_contact BETWEEN 1 AND 5),
  score_description integer NOT NULL CHECK (score_description BETWEEN 1 AND 5),
  score_shipping integer NOT NULL CHECK (score_shipping BETWEEN 1 AND 5),
  score_avg numeric(3,2) GENERATED ALWAYS AS ((score_contact + score_description + score_shipping) / 3.0) STORED,
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.listing_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_all" ON public.listing_reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON public.listing_reviews FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- Pending reviews
CREATE TABLE IF NOT EXISTS public.pending_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  seller_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id uuid REFERENCES public.general_listings(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.pending_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_reviews_buyer" ON public.pending_reviews FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "pending_reviews_delete_buyer" ON public.pending_reviews FOR DELETE USING (buyer_id = auth.uid());

-- Tabela ocen klientów (przez usługodawców)
CREATE TABLE IF NOT EXISTS public.client_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id UUID NOT NULL,
  reviewer_provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.service_bookings(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_anonymous BOOLEAN DEFAULT true
);

-- Enable RLS
ALTER TABLE public.client_reviews ENABLE ROW LEVEL SECURITY;

-- Provider can create reviews for their clients
CREATE POLICY "Providers can create client reviews"
ON public.client_reviews
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = reviewer_provider_id AND sp.user_id = auth.uid()
  )
);

-- Provider can view their own reviews
CREATE POLICY "Providers can view own reviews"
ON public.client_reviews
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = reviewer_provider_id AND sp.user_id = auth.uid()
  )
);

-- Clients can view reviews about them (anonymous - only rating/comment visible)
CREATE POLICY "Clients can view reviews about them"
ON public.client_reviews
FOR SELECT
USING (client_user_id = auth.uid());

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_client_reviews_client ON public.client_reviews(client_user_id);
CREATE INDEX IF NOT EXISTS idx_client_reviews_provider ON public.client_reviews(reviewer_provider_id);
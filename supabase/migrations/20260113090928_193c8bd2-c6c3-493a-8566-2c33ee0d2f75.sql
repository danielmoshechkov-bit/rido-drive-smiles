-- Create ad_campaigns table
CREATE TABLE public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  placement TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  target_url TEXT,
  is_active BOOLEAN DEFAULT false,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Public can view active ads
CREATE POLICY "Anyone can view active ads"
ON public.ad_campaigns
FOR SELECT
USING (is_active = true);

-- Admins can manage all ads
CREATE POLICY "Admins can manage ads"
ON public.ad_campaigns
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

-- Create storage bucket for ad media
INSERT INTO storage.buckets (id, name, public) VALUES ('ad-media', 'ad-media', true);

-- Storage policies for ad media
CREATE POLICY "Public can view ad media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'ad-media');

CREATE POLICY "Admins can upload ad media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'ad-media' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

CREATE POLICY "Admins can update ad media"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'ad-media' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

CREATE POLICY "Admins can delete ad media"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'ad-media' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'real_estate_admin')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_ad_campaigns_updated_at
BEFORE UPDATE ON public.ad_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
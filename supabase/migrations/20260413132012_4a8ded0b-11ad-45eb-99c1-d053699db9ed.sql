
-- Create storage bucket for workshop order photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('workshop-order-photos', 'workshop-order-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to the bucket
CREATE POLICY "Workshop providers can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'workshop-order-photos');

-- Allow anyone to view photos (needed for client portal)
CREATE POLICY "Workshop photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'workshop-order-photos');

-- Allow authenticated users to delete their photos
CREATE POLICY "Workshop providers can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'workshop-order-photos');

-- Add file_type column to distinguish intake photos from other files
ALTER TABLE public.workshop_order_files
ADD COLUMN IF NOT EXISTS file_type text DEFAULT 'attachment';

-- Add expires_at column for auto-cleanup
ALTER TABLE public.workshop_order_files
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Allow anon users to view order files (for client portal)
CREATE POLICY "Anon can view order files via client code"
ON public.workshop_order_files
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.workshop_orders wo
    WHERE wo.id = workshop_order_files.order_id
    AND wo.client_code IS NOT NULL
  )
);

-- Function to clean up expired files
CREATE OR REPLACE FUNCTION public.cleanup_expired_workshop_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, file_url FROM public.workshop_order_files
    WHERE expires_at IS NOT NULL AND expires_at < now()
  LOOP
    -- Delete the storage object
    DELETE FROM storage.objects WHERE name = rec.file_url AND bucket_id = 'workshop-order-photos';
    -- Delete the database record
    DELETE FROM public.workshop_order_files WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Reset stuck/failed translation queue items to pending
UPDATE public.translation_queue 
SET status = 'pending', attempts = 0, error_msg = null, started_at = null
WHERE status IN ('processing', 'failed');

-- Add unique constraint on listing_translations for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_translations_composite 
ON public.listing_translations (listing_id, listing_type, target_lang);

-- Ensure RLS policy for service_role on listing_translations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'listing_translations' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_all" ON public.listing_translations FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;
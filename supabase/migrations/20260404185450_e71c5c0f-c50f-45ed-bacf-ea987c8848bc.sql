
-- Remove all duplicate rows, keep only one
DELETE FROM public.sms_settings
WHERE id NOT IN (
  SELECT id FROM public.sms_settings
  ORDER BY created_at ASC
  LIMIT 1
);

-- Add unique constraint to prevent future duplicates (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS sms_settings_singleton_idx ON public.sms_settings ((true));

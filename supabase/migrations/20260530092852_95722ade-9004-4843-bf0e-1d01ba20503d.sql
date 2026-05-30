
ALTER TABLE public.referral_uses DROP CONSTRAINT IF EXISTS referral_uses_status_check;
ALTER TABLE public.referral_uses ADD CONSTRAINT referral_uses_status_check
  CHECK (status IN ('pending','pending_first_purchase','completed','suspicious','expired','rejected'));
UPDATE public.referral_settings SET is_enabled = true;

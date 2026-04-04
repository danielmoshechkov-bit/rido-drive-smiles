ALTER TABLE public.user_invoices
ADD COLUMN IF NOT EXISTS ksef_session_ref text,
ADD COLUMN IF NOT EXISTS ksef_error text;
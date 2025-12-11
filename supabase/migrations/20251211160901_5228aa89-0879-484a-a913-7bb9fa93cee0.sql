-- Add SMTP configuration columns to email_settings
ALTER TABLE email_settings 
ADD COLUMN IF NOT EXISTS smtp_host text DEFAULT 'getrido.pl',
ADD COLUMN IF NOT EXISTS smtp_port integer DEFAULT 587,
ADD COLUMN IF NOT EXISTS smtp_user text DEFAULT 'kontakt@getrido.pl',
ADD COLUMN IF NOT EXISTS smtp_secure boolean DEFAULT true;

-- Update default record with SMTP settings
UPDATE email_settings 
SET smtp_host = 'getrido.pl',
    smtp_port = 587,
    smtp_user = 'kontakt@getrido.pl',
    smtp_provider = 'smtp',
    sender_email = 'kontakt@getrido.pl'
WHERE id = '00000000-0000-0000-0000-000000000001';
-- Update email settings to use port 465 with SSL for nazwa.pl SMTP
UPDATE email_settings 
SET 
  smtp_port = 465, 
  smtp_secure = true, 
  smtp_host = 'server546721.nazwa.pl'
WHERE id = '00000000-0000-0000-0000-000000000001';
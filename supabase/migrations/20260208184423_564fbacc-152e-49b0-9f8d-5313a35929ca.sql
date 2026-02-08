UPDATE email_settings 
SET 
  smtp_host = 'mail-serwer408603.lh.pl',
  smtp_port = 465,
  smtp_secure = true,
  smtp_user = 'noreply@getrido.pl',
  sender_email = 'noreply@getrido.pl'
WHERE id = '00000000-0000-0000-0000-000000000001';
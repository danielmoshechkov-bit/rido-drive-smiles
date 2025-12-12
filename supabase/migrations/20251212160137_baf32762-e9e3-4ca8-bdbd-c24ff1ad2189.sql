-- Update all email templates to use the new mascot image
UPDATE email_settings 
SET 
  password_reset_template = REPLACE(password_reset_template, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  password_reset_template_en = REPLACE(password_reset_template_en, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  password_reset_template_ru = REPLACE(password_reset_template_ru, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  password_reset_template_ua = REPLACE(password_reset_template_ua, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  password_reset_template_kz = REPLACE(password_reset_template_kz, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  registration_template = REPLACE(registration_template, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  registration_template_en = REPLACE(registration_template_en, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  registration_template_ru = REPLACE(registration_template_ru, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  registration_template_ua = REPLACE(registration_template_ua, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  registration_template_kz = REPLACE(registration_template_kz, 'https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png', 'https://getrido.pl/lovable-uploads/getrido-mascot-email.png'),
  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
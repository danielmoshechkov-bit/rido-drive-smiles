-- Add preferred_language column to drivers table
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'pl';

-- Add multilingual email template columns to email_settings
ALTER TABLE public.email_settings 
ADD COLUMN IF NOT EXISTS registration_template_en TEXT DEFAULT '<h1>Welcome {{first_name}}!</h1>
<p>Thank you for registering on the RIDO platform.</p>
<p>To activate your account, click the link below:</p>
<p><a href="{{activation_link}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Activate account</a></p>
<p>The link is valid for 24 hours.</p>
<p>Best regards,<br>RIDO Team</p>',
ADD COLUMN IF NOT EXISTS registration_template_ru TEXT DEFAULT '<h1>Добро пожаловать, {{first_name}}!</h1>
<p>Благодарим за регистрацию на платформе RIDO.</p>
<p>Чтобы активировать свой аккаунт, нажмите на ссылку ниже:</p>
<p><a href="{{activation_link}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Активировать аккаунт</a></p>
<p>Ссылка действительна 24 часа.</p>
<p>С уважением,<br>Команда RIDO</p>',
ADD COLUMN IF NOT EXISTS registration_template_ua TEXT DEFAULT '<h1>Вітаємо, {{first_name}}!</h1>
<p>Дякуємо за реєстрацію на платформі RIDO.</p>
<p>Щоб активувати свій обліковий запис, натисніть на посилання нижче:</p>
<p><a href="{{activation_link}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Активувати обліковий запис</a></p>
<p>Посилання дійсне протягом 24 годин.</p>
<p>З повагою,<br>Команда RIDO</p>',
ADD COLUMN IF NOT EXISTS registration_template_kz TEXT DEFAULT '<h1>Қош келдіңіз, {{first_name}}!</h1>
<p>RIDO платформасына тіркелгеніңіз үшін рахмет.</p>
<p>Есептік жазбаңызды белсендіру үшін төмендегі сілтемені басыңыз:</p>
<p><a href="{{activation_link}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Есептік жазбаны белсендіру</a></p>
<p>Сілтеме 24 сағат бойы жарамды.</p>
<p>Құрметпен,<br>RIDO командасы</p>',
ADD COLUMN IF NOT EXISTS registration_subject_en TEXT DEFAULT 'Confirm your RIDO registration',
ADD COLUMN IF NOT EXISTS registration_subject_ru TEXT DEFAULT 'Подтвердите регистрацию в RIDO',
ADD COLUMN IF NOT EXISTS registration_subject_ua TEXT DEFAULT 'Підтвердіть реєстрацію в RIDO',
ADD COLUMN IF NOT EXISTS registration_subject_kz TEXT DEFAULT 'RIDO тіркелуін растаңыз';
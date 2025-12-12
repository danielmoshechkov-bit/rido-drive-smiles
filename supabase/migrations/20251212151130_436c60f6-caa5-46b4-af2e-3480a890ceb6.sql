-- Add password reset email template columns
ALTER TABLE public.email_settings 
ADD COLUMN IF NOT EXISTS password_reset_subject TEXT DEFAULT 'Resetowanie hasła w RIDO',
ADD COLUMN IF NOT EXISTS password_reset_template TEXT DEFAULT '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #333; margin: 0;">get RIDO</h1>
  </div>
  <h2 style="color: #333;">Resetowanie hasła</h2>
  <p>Cześć {{first_name}},</p>
  <p>Otrzymaliśmy prośbę o zmianę hasła do Twojego konta w systemie RIDO.</p>
  <p>Kliknij poniższy przycisk, aby ustawić nowe hasło:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Zmień hasło</a>
  </div>
  <p style="color: #666; font-size: 14px;"><strong>⚠️ Ważne:</strong> Jeśli to nie Ty wysłałeś tę prośbę, zignoruj tę wiadomość. Twoje hasło nie zostanie zmienione.</p>
  <p style="color: #666; font-size: 14px;">Link jest ważny przez 24 godziny.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">© 2025 get RIDO. Wszelkie prawa zastrzeżone.</p>
</div>',
ADD COLUMN IF NOT EXISTS password_reset_subject_en TEXT DEFAULT 'Reset your RIDO password',
ADD COLUMN IF NOT EXISTS password_reset_template_en TEXT DEFAULT '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #333; margin: 0;">get RIDO</h1>
  </div>
  <h2 style="color: #333;">Password Reset</h2>
  <p>Hello {{first_name}},</p>
  <p>We received a request to reset your RIDO account password.</p>
  <p>Click the button below to set a new password:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Change Password</a>
  </div>
  <p style="color: #666; font-size: 14px;"><strong>⚠️ Important:</strong> If you did not request this, please ignore this email. Your password will not be changed.</p>
  <p style="color: #666; font-size: 14px;">This link is valid for 24 hours.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">© 2025 get RIDO. All rights reserved.</p>
</div>',
ADD COLUMN IF NOT EXISTS password_reset_subject_ru TEXT DEFAULT 'Сброс пароля RIDO',
ADD COLUMN IF NOT EXISTS password_reset_template_ru TEXT DEFAULT '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #333; margin: 0;">get RIDO</h1>
  </div>
  <h2 style="color: #333;">Сброс пароля</h2>
  <p>Привет {{first_name}},</p>
  <p>Мы получили запрос на сброс пароля вашей учётной записи RIDO.</p>
  <p>Нажмите кнопку ниже, чтобы установить новый пароль:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Изменить пароль</a>
  </div>
  <p style="color: #666; font-size: 14px;"><strong>⚠️ Важно:</strong> Если вы не запрашивали сброс пароля, проигнорируйте это письмо. Ваш пароль не будет изменён.</p>
  <p style="color: #666; font-size: 14px;">Ссылка действительна 24 часа.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">© 2025 get RIDO. Все права защищены.</p>
</div>',
ADD COLUMN IF NOT EXISTS password_reset_subject_ua TEXT DEFAULT 'Скидання пароля RIDO',
ADD COLUMN IF NOT EXISTS password_reset_template_ua TEXT DEFAULT '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #333; margin: 0;">get RIDO</h1>
  </div>
  <h2 style="color: #333;">Скидання пароля</h2>
  <p>Привіт {{first_name}},</p>
  <p>Ми отримали запит на скидання пароля вашого облікового запису RIDO.</p>
  <p>Натисніть кнопку нижче, щоб встановити новий пароль:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Змінити пароль</a>
  </div>
  <p style="color: #666; font-size: 14px;"><strong>⚠️ Важливо:</strong> Якщо ви не надсилали цей запит, проігноруйте цей лист. Ваш пароль не буде змінено.</p>
  <p style="color: #666; font-size: 14px;">Посилання дійсне 24 години.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">© 2025 get RIDO. Усі права захищені.</p>
</div>',
ADD COLUMN IF NOT EXISTS password_reset_subject_kz TEXT DEFAULT 'RIDO құпия сөзін қалпына келтіру',
ADD COLUMN IF NOT EXISTS password_reset_template_kz TEXT DEFAULT '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #333; margin: 0;">get RIDO</h1>
  </div>
  <h2 style="color: #333;">Құпия сөзді қалпына келтіру</h2>
  <p>Сәлем {{first_name}},</p>
  <p>Біз сіздің RIDO тіркелгіңіздің құпия сөзін қалпына келтіру сұрауын алдық.</p>
  <p>Жаңа құпия сөзді орнату үшін төмендегі түймені басыңыз:</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Құпия сөзді өзгерту</a>
  </div>
  <p style="color: #666; font-size: 14px;"><strong>⚠️ Маңызды:</strong> Егер сіз бұл сұрауды жібермеген болсаңыз, бұл хатты елемеңіз. Сіздің құпия сөзіңіз өзгермейді.</p>
  <p style="color: #666; font-size: 14px;">Сілтеме 24 сағат жарамды.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="color: #999; font-size: 12px; text-align: center;">© 2025 get RIDO. Барлық құқықтар қорғалған.</p>
</div>';
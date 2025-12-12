-- Update all email templates with new RIDO branded design

UPDATE email_settings SET
  -- Password Reset Templates
  password_reset_template = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Resetowanie hasła</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Cześć <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Otrzymaliśmy prośbę o zmianę hasła do Twojego konta w systemie RIDO.</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Kliknij poniższy przycisk, aby ustawić nowe hasło:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Zmień hasło</a>
    </div>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <p style="color: #92400e; font-size: 14px; margin: 0;"><strong>⚠️ Ważne:</strong> Jeśli to nie Ty wysłałeś tę prośbę, zignoruj tę wiadomość. Twoje hasło nie zostanie zmienione.</p>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Link jest ważny przez 24 godziny.</p>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Wszelkie prawa zastrzeżone.</p>
  </div>
</div>',

  password_reset_template_en = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Password Reset</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hello <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">We received a request to reset your RIDO account password.</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Click the button below to set a new password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Change Password</a>
    </div>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <p style="color: #92400e; font-size: 14px; margin: 0;"><strong>⚠️ Important:</strong> If you did not request this, please ignore this email. Your password will not be changed.</p>
    </div>
    <p style="color: #6b7280; font-size: 14px;">This link is valid for 24 hours.</p>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. All rights reserved.</p>
  </div>
</div>',

  password_reset_template_ru = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Сброс пароля</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Привет <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Мы получили запрос на сброс пароля вашей учётной записи RIDO.</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Нажмите кнопку ниже, чтобы установить новый пароль:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Изменить пароль</a>
    </div>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <p style="color: #92400e; font-size: 14px; margin: 0;"><strong>⚠️ Важно:</strong> Если вы не запрашивали сброс пароля, проигнорируйте это письмо. Ваш пароль не будет изменён.</p>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Ссылка действительна 24 часа.</p>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Все права защищены.</p>
  </div>
</div>',

  password_reset_template_ua = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Скидання пароля</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Привіт <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Ми отримали запит на скидання пароля вашого облікового запису RIDO.</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Натисніть кнопку нижче, щоб встановити новий пароль:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Змінити пароль</a>
    </div>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <p style="color: #92400e; font-size: 14px; margin: 0;"><strong>⚠️ Важливо:</strong> Якщо ви не надсилали цей запит, проігноруйте цей лист. Ваш пароль не буде змінено.</p>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Посилання дійсне 24 години.</p>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Усі права захищені.</p>
  </div>
</div>',

  password_reset_template_kz = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Құпия сөзді қалпына келтіру</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Сәлем <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Біз сіздің RIDO тіркелгіңіздің құпия сөзін қалпына келтіру сұрауын алдық.</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Жаңа құпия сөзді орнату үшін төмендегі түймені басыңыз:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Құпия сөзді өзгерту</a>
    </div>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <p style="color: #92400e; font-size: 14px; margin: 0;"><strong>⚠️ Маңызды:</strong> Егер сіз бұл сұрауды жібермеген болсаңыз, бұл хатты елемеңіз. Сіздің құпия сөзіңіз өзгермейді.</p>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Сілтеме 24 сағат жарамды.</p>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Барлық құқықтар қорғалған.</p>
  </div>
</div>',

  -- Registration Templates
  registration_template = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Witaj w RIDO! 🎉</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Cześć <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Dziękujemy za rejestrację na platformie RIDO. Aby aktywować swoje konto, kliknij poniższy przycisk:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Aktywuj konto</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Link jest ważny przez 24 godziny.</p>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="color: #374151; font-size: 14px; margin: 0;">💡 <strong>Wskazówka:</strong> Po aktywacji konta pobierz naszą aplikację mobilną, aby mieć dostęp do rozliczeń w każdej chwili!</p>
    </div>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Wszelkie prawa zastrzeżone.</p>
  </div>
</div>',

  registration_template_en = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Welcome to RIDO! 🎉</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Hello <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Thank you for registering on the RIDO platform. To activate your account, click the button below:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Activate Account</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">The link is valid for 24 hours.</p>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="color: #374151; font-size: 14px; margin: 0;">💡 <strong>Tip:</strong> After activating your account, download our mobile app to access your settlements anytime!</p>
    </div>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. All rights reserved.</p>
  </div>
</div>',

  registration_template_ru = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Добро пожаловать в RIDO! 🎉</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Привет <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Благодарим за регистрацию на платформе RIDO. Чтобы активировать свой аккаунт, нажмите на кнопку ниже:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Активировать аккаунт</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Ссылка действительна 24 часа.</p>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="color: #374151; font-size: 14px; margin: 0;">💡 <strong>Совет:</strong> После активации аккаунта скачайте наше мобильное приложение, чтобы иметь доступ к расчётам в любое время!</p>
    </div>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Все права защищены.</p>
  </div>
</div>',

  registration_template_ua = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">Ласкаво просимо до RIDO! 🎉</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Привіт <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Дякуємо за реєстрацію на платформі RIDO. Щоб активувати свій обліковий запис, натисніть кнопку нижче:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Активувати обліковий запис</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Посилання дійсне протягом 24 годин.</p>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="color: #374151; font-size: 14px; margin: 0;">💡 <strong>Порада:</strong> Після активації облікового запису завантажте наш мобільний додаток, щоб мати доступ до розрахунків у будь-який час!</p>
    </div>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Усі права захищені.</p>
  </div>
</div>',

  registration_template_kz = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="https://getrido.pl/lovable-uploads/a4e8a919-1b0c-497b-aa7f-55337b0bc02f.png" alt="RIDO" width="80" height="80" style="border-radius: 12px;"/>
    </div>
    <h2 style="color: #1f2937; text-align: center; margin: 0 0 24px 0; font-size: 24px;">RIDO-ға қош келдіңіз! 🎉</h2>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">Сәлем <strong>{{first_name}}</strong>,</p>
    <p style="color: #374151; font-size: 16px; line-height: 1.6;">RIDO платформасына тіркелгеніңіз үшін рахмет. Есептік жазбаңызды белсендіру үшін төмендегі түймені басыңыз:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Есептік жазбаны белсендіру</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Сілтеме 24 сағат бойы жарамды.</p>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px;">
      <p style="color: #374151; font-size: 14px; margin: 0;">💡 <strong>Кеңес:</strong> Есептік жазбаңызды белсендіргеннен кейін, кез келген уақытта есеп-қисаптарға қол жеткізу үшін мобильді қосымшамызды жүктеп алыңыз!</p>
    </div>
  </div>
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
    <p style="color: rgba(255,255,255,0.9); font-size: 12px; margin: 0;">© 2025 get RIDO. Барлық құқықтар қорғалған.</p>
  </div>
</div>',

  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
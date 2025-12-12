-- Update all 10 email templates: remove mascot from top, add next to button, raise content

UPDATE email_settings SET
  -- Polish password reset
  password_reset_template = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Cześć {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w portalu RIDO. Kliknij poniższy przycisk, aby ustawić nowe hasło:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Zmień hasło</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                ⚠️ Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość. Twoje konto pozostanie bezpieczne.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Wszelkie prawa zastrzeżone.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- English password reset
  password_reset_template_en = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Hi {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                We received a request to reset your password for your RIDO portal account. Click the button below to set a new password:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Reset Password</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                ⚠️ If you did not request a password reset, please ignore this message. Your account will remain secure.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Russian password reset
  password_reset_template_ru = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Привет {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Мы получили запрос на сброс пароля для вашей учетной записи в портале RIDO. Нажмите кнопку ниже, чтобы установить новый пароль:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Сменить пароль</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                ⚠️ Если вы не запрашивали сброс пароля, проигнорируйте это сообщение. Ваш аккаунт останется в безопасности.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Все права защищены.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Ukrainian password reset
  password_reset_template_ua = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Привіт {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Ми отримали запит на скидання пароля для вашого облікового запису в порталі RIDO. Натисніть кнопку нижче, щоб встановити новий пароль:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Змінити пароль</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                ⚠️ Якщо ви не запитували скидання пароля, проігноруйте це повідомлення. Ваш обліковий запис залишиться в безпеці.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Усі права захищені.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Kazakh password reset
  password_reset_template_kz = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Сәлем {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                RIDO порталындағы есептік жазбаңыздың құпия сөзін қалпына келтіру сұрауын алдық. Жаңа құпия сөзді орнату үшін төмендегі батырманы басыңыз:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{reset_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Құпия сөзді өзгерту</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                ⚠️ Егер сіз құпия сөзді қалпына келтіруді сұрамаған болсаңыз, бұл хабарламаны елемеңіз. Сіздің есептік жазбаңыз қауіпсіз болып қалады.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Барлық құқықтар қорғалған.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Polish registration
  registration_template = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Witaj {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Dziękujemy za rejestrację w portalu kierowców RIDO. Kliknij poniższy przycisk, aby aktywować swoje konto:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Aktywuj konto</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0;">
                Jeśli nie rejestrowałeś się w RIDO, zignoruj tę wiadomość.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Wszelkie prawa zastrzeżone.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- English registration
  registration_template_en = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Welcome {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Thank you for registering in the RIDO driver portal. Click the button below to activate your account:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Activate Account</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0;">
                If you did not register for RIDO, please ignore this message.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Russian registration
  registration_template_ru = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Добро пожаловать {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Благодарим за регистрацию в портале водителей RIDO. Нажмите кнопку ниже, чтобы активировать свой аккаунт:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Активировать аккаунт</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0;">
                Если вы не регистрировались в RIDO, проигнорируйте это сообщение.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Все права защищены.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Ukrainian registration
  registration_template_ua = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Ласкаво просимо {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Дякуємо за реєстрацію в порталі водіїв RIDO. Натисніть кнопку нижче, щоб активувати свій обліковий запис:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Активувати акаунт</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0;">
                Якщо ви не реєструвалися в RIDO, проігноруйте це повідомлення.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Усі права захищені.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  -- Kazakh registration
  registration_template_kz = '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">get RIDO</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Driver Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <h2 style="color: #18181b; margin: 0 0 16px 0; font-size: 22px;">Қош келдіңіз {{first_name}}!</h2>
              <p style="color: #52525b; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                RIDO жүргізуші порталына тіркелгеніңіз үшін рахмет. Есептік жазбаңызды белсендіру үшін төмендегі батырманы басыңыз:
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 24px auto;">
                <tr>
                  <td style="padding-right: 16px;">
                    <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">Есептік жазбаны белсендіру</a>
                  </td>
                  <td>
                    <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="60" height="60" style="border-radius: 12px; display: block;"/>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0;">
                Егер сіз RIDO-ға тіркелмеген болсаңыз, бұл хабарламаны елемеңіз.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Барлық құқықтар қорғалған.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',

  updated_at = now()
WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE email_settings 
SET registration_template = '<!DOCTYPE html>
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
              <img src="https://getrido.pl/getrido-mascot-email.png" alt="RIDO" width="80" height="80" style="border-radius: 16px; display: block; margin: 0 auto 12px auto;"/>
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
                  <td align="center">
                    <a href="{{activation_link}}" style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);">Aktywuj konto</a>
                  </td>
                </tr>
              </table>
              <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">
                Jeśli nie rejestrowałeś się w RIDO, zignoruj tę wiadomość.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
              <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin: 0 0 8px 0; text-align: center;">
                To jest wiadomość automatyczna, prosimy na nią nie odpowiadać.
              </p>
              <p style="color: #71717a; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0; text-align: center;">
                Jeśli potrzebujesz pomocy, skontaktuj się z nami: <a href="mailto:kontakt@getrido.pl" style="color: #8B5CF6; text-decoration: none;">kontakt@getrido.pl</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background-color: #f4f4f5; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; margin: 0;">© 2025 RIDO. Wszelkie prawa zastrzeżone.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'
WHERE id = '00000000-0000-0000-0000-000000000001';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  company_name: string;
  contact_name: string;
  activation_link: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting send-fleet-registration-email function");

    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      console.error("SMTP_PASSWORD not configured");
      throw new Error("SMTP_PASSWORD nie jest skonfigurowany");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (settingsError || !emailSettings) {
      console.error("Error fetching email settings:", settingsError);
      throw new Error("Nie udało się pobrać ustawień email");
    }

    const { email, company_name, contact_name, activation_link }: EmailRequest = await req.json();

    console.log(`Processing fleet registration email for: ${email}, company: ${company_name}`);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: `Nieprawidłowy format adresu email: ${email}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const firstName = contact_name.split(" ")[0] || "Administratorze";

    // Fleet-specific HTML template
    const htmlContent = `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Witamy w GetRido Fleet</title></head><body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f4f5;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;"><table role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);"><tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:40px 30px;text-align:center;"><img src="https://getrido.pl/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="GetRido" style="height:60px;margin-bottom:20px;"><h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Portal do zarządzania Flotą</h1><p style="color:#e9d5ff;margin:10px 0 0 0;font-size:16px;">Zarządzaj flotą, rozliczeniami i kierowcami</p></td></tr><tr><td style="padding:40px 30px;"><h2 style="color:#1f2937;margin:0 0 20px 0;font-size:22px;">Witaj, ${firstName}! 👋</h2><p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 20px 0;">Dziękujemy za rejestrację firmy <strong>${company_name}</strong> w portalu do zarządzania flotą GetRido.</p><p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 30px 0;">Aby aktywować konto i rozpocząć zarządzanie flotą, kliknij przycisk poniżej:</p><table role="presentation" style="width:100%;"><tr><td style="text-align:center;padding:20px 0;"><a href="${activation_link}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(124,58,237,0.4);">✅ Aktywuj konto floty</a></td></tr></table><div style="background-color:#f3f4f6;border-radius:12px;padding:20px;margin:30px 0;"><h3 style="color:#1f2937;margin:0 0 15px 0;font-size:16px;">🚀 Co możesz zrobić w panelu floty:</h3><ul style="color:#4b5563;font-size:14px;line-height:1.8;margin:0;padding-left:20px;"><li>Zarządzać kierowcami i ich danymi</li><li>Tworzyć rozliczenia i faktury</li><li>Monitorować przychody i wydatki</li><li>Generować raporty i zestawienia</li></ul></div><p style="color:#6b7280;font-size:14px;line-height:1.6;margin:20px 0 0 0;">Link aktywacyjny wygasa po 24 godzinach. Jeśli nie rejestrowałeś konta, zignoruj tę wiadomość.</p></td></tr><tr><td style="background-color:#f9fafb;padding:30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0 0 10px 0;">Ta wiadomość została wysłana automatycznie.</p><p style="color:#6b7280;font-size:12px;margin:0;">© 2026 GetRido. Wszelkie prawa zastrzeżone.</p><p style="color:#9ca3af;font-size:12px;margin:10px 0 0 0;">Masz pytania? Napisz do nas: <a href="mailto:kontakt@getrido.pl" style="color:#7c3aed;">kontakt@getrido.pl</a></p></td></tr></table></td></tr></table></body></html>`;

    const senderName = emailSettings.sender_name || "GetRido Fleet";
    const senderEmail = emailSettings.sender_email || emailSettings.smtp_user;
    const subject = `Aktywuj konto floty - ${company_name}`;

    console.log(`Sending fleet email from: ${senderName} <${senderEmail}>`);

    const port = emailSettings.smtp_port || 587;
    const useTls = port === 465;

    const client = new SMTPClient({
      connection: {
        hostname: emailSettings.smtp_host || "getrido.pl",
        port: port,
        tls: useTls,
        auth: {
          username: emailSettings.smtp_user || "kontakt@getrido.pl",
          password: smtpPassword,
        },
      },
    });

    const minifiedHtml = htmlContent
      .replace(/\r\n/g, '\n')
      .replace(/\n\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();

    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      subject: subject,
      content: "Twoja przeglądarka nie obsługuje HTML.",
      html: minifiedHtml,
    });

    await client.close();

    console.log("Fleet registration email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Email wysłany pomyślnie" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-fleet-registration-email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

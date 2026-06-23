import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Zaproszenia do projektów wychodzą TYM SAMYM kanałem co maile systemowe
// (potwierdzenie rejestracji itd.): firmowy SMTP z tabeli email_settings
// (kontakt@getrido.pl przez nazwa.pl), sekret SMTP_PASSWORD. BEZ Resend.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  inviterName: string;
  projectName: string;
  isRegistered: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) throw new Error("SMTP_PASSWORD nie jest skonfigurowany w sekretach Supabase.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Te same ustawienia SMTP co maile systemowe
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();
    if (settingsError || !emailSettings) throw new Error("Nie udało się pobrać ustawień email (email_settings).");

    const { email, inviterName, projectName, isRegistered }: InvitationRequest = await req.json();
    if (!email || !projectName) throw new Error("Brak wymaganych pól (email, projectName).");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ success: false, error: `Nieprawidłowy email: ${email}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const portalUrl = "https://getrido.pl";
    // Link prowadzi na STRONĘ GŁÓWNĄ z flagą ?invite=1 — tam ramka „Zostałeś
    // zaproszony". Trasy /logowanie i /rejestracja NIE istnieją (były 404);
    // logowanie/rejestracja jest pod /auth, a ramka kieruje tam w razie potrzeby.
    const actionUrl = `${portalUrl}/?invite=1`;
    const actionLabel = isRegistered ? "Zaloguj się i dołącz" : "Zarejestruj się i dołącz";
    const actionDescription = isRegistered
      ? "Zaloguj się na swoje konto, aby dołączyć do projektu i rozpocząć współpracę."
      : "Utwórz darmowe konto w portalu GetRido, aby dołączyć do projektu i rozpocząć współpracę z zespołem.";

    const senderName = emailSettings.sender_name || "GetRido";
    const senderEmail = emailSettings.sender_email || emailSettings.smtp_user || "kontakt@getrido.pl";
    const subject = `${inviterName} zaprasza Cię do projektu „${projectName}"`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<div style="background:linear-gradient(135deg,#6C3CF0 0%,#8B5CF6 100%);padding:30px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;">GetRido</h1>
<p style="color:#e0d4fc;margin:10px 0 0 0;font-size:14px;">Zaproszenie do projektu</p></div>
<div style="padding:30px;">
<h2 style="color:#1a1a2e;margin:0 0 20px 0;">Cześć!</h2>
<p style="color:#4a5568;line-height:1.6;margin:0 0 20px 0;"><strong>${inviterName}</strong> zaprasza Cię do wspólnej pracy nad projektem w portalu GetRido.</p>
<div style="background-color:#f8f5ff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #6C3CF0;">
<p style="color:#64748b;font-size:12px;margin:0 0 5px 0;text-transform:uppercase;letter-spacing:1px;">Projekt</p>
<p style="color:#1a1a2e;font-size:18px;font-weight:600;margin:0;">${projectName}</p></div>
<p style="color:#4a5568;line-height:1.6;margin:0 0 25px 0;">${actionDescription}</p>
<div style="text-align:center;margin:30px 0;">
<a href="${actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3CF0 0%,#8B5CF6 100%);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;">Kliknij, aby dołączyć do projektu</a></div>
<div style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:20px 0;">
<p style="color:#64748b;font-size:13px;line-height:1.5;margin:0 0 8px 0;">Jeśli przycisk nie działa, skopiuj i wklej ten link do przeglądarki:</p>
<p style="margin:0;"><a href="${actionUrl}" style="color:#6C3CF0;font-size:13px;word-break:break-all;">${actionUrl}</a></p></div>
<div style="border-top:1px solid #e2e8f0;padding-top:20px;margin-top:30px;">
<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">Jeśli nie spodziewałeś/-aś się tego zaproszenia, zignoruj tę wiadomość.</p></div></div>
<div style="background-color:#f8fafc;padding:20px;text-align:center;">
<p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} GetRido. Wszelkie prawa zastrzeżone.</p>
<p style="color:#94a3b8;font-size:11px;margin:5px 0 0 0;">kontakt@getrido.pl</p></div></div></body></html>`;

    // Minifikacja (limit długości linii SMTP) + normalizacja końców linii do CRLF.
    // Serwer qmail (LH.pl) odrzuca „bare line feeds" (\n) błędem 451 — wszystkie
    // znaki nowej linii MUSZĄ być \r\n (w treści i HTML).
    const minifiedHtml = html
      .replace(/\r\n/g, '\n').replace(/\n\s+/g, ' ').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim()
      .replace(/\n/g, '\r\n');
    const textContent = `Cześć!\n\n${inviterName} zaprasza Cię do projektu „${projectName}" w GetRido.\n${actionDescription}\n\n${actionLabel}: ${actionUrl}\n\n--\nGetRido`
      .replace(/\r?\n/g, '\r\n');

    const port = emailSettings.smtp_port || 465;
    const client = new SMTPClient({
      connection: {
        hostname: emailSettings.smtp_host || "getrido.pl",
        port,
        tls: port === 465,
        auth: { username: emailSettings.smtp_user || "kontakt@getrido.pl", password: smtpPassword },
      },
    });

    console.log(`[invite] Sending to ${email} from ${senderName} <${senderEmail}> via ${emailSettings.smtp_host}:${port}`);

    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      replyTo: senderEmail,
      subject,
      content: textContent,
      html: minifiedHtml,
      headers: { 'X-Mailer': 'GetRido Workspace', 'Auto-Submitted': 'auto-generated' },
    });
    await client.close();

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error sending invitation:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);

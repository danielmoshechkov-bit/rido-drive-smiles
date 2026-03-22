import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const resend = new Resend(resendApiKey);
    const { email, inviterName, projectName, isRegistered }: InvitationRequest = await req.json();

    if (!email || !projectName) {
      throw new Error("Missing required fields");
    }

    const portalUrl = "https://getrido.pl";
    const registerUrl = `${portalUrl}/rejestracja`;
    const loginUrl = `${portalUrl}/logowanie`;

    const actionUrl = isRegistered ? loginUrl : registerUrl;
    const actionLabel = isRegistered ? "Zaloguj się i dołącz" : "Zarejestruj się i dołącz";
    const actionDescription = isRegistered
      ? "Zaloguj się na swoje konto, aby dołączyć do projektu i rozpocząć współpracę."
      : "Utwórz darmowe konto w portalu GetRido, aby dołączyć do projektu i rozpocząć współpracę z zespołem.";

    console.log(`Sending project invitation to ${email} for project "${projectName}"`);

    const emailResponse = await resend.emails.send({
      from: "GetRido <noreply@getrido.pl>",
      to: [email],
      subject: `${inviterName} zaprasza Cię do projektu „${projectName}"`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<div style="background:linear-gradient(135deg,#6C3CF0 0%,#8B5CF6 100%);padding:30px;text-align:center;">
<h1 style="color:#ffffff;margin:0;font-size:24px;">GetRido</h1>
<p style="color:#e0d4fc;margin:10px 0 0 0;font-size:14px;">Zaproszenie do projektu</p>
</div>
<div style="padding:30px;">
<h2 style="color:#1a1a2e;margin:0 0 20px 0;">Cześć!</h2>
<p style="color:#4a5568;line-height:1.6;margin:0 0 20px 0;">
<strong>${inviterName}</strong> zaprasza Cię do wspólnej pracy nad projektem w portalu GetRido.
</p>
<div style="background-color:#f8f5ff;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #6C3CF0;">
<p style="color:#64748b;font-size:12px;margin:0 0 5px 0;text-transform:uppercase;letter-spacing:1px;">Projekt</p>
<p style="color:#1a1a2e;font-size:18px;font-weight:600;margin:0;">${projectName}</p>
</div>
<p style="color:#4a5568;line-height:1.6;margin:0 0 25px 0;">
${actionDescription}
</p>
<div style="text-align:center;margin:30px 0;">
<a href="${actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3CF0 0%,#8B5CF6 100%);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:16px;font-weight:600;">${actionLabel}</a>
</div>
<div style="border-top:1px solid #e2e8f0;padding-top:20px;margin-top:30px;">
<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
Jeśli nie spodziewałeś/-aś się tego zaproszenia, zignoruj tę wiadomość.
</p>
</div>
</div>
<div style="background-color:#f8fafc;padding:20px;text-align:center;">
<p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} GetRido. Wszelkie prawa zastrzeżone.</p>
<p style="color:#94a3b8;font-size:11px;margin:5px 0 0 0;">kontakt@getrido.pl</p>
</div>
</div>
</body></html>`,
    });

    console.log("Invitation email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error sending invitation:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);

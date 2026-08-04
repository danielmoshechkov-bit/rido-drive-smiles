import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "daniel.moshechkvo@gmail.com";

// Simple in-memory throttle (per cold start) to avoid spamming
const recentlySent = new Map<string, number>();
const THROTTLE_MS = 15 * 60 * 1000; // 15 min per error key

serve(async (req) => {
  return phaseABlockedResponse(req, "report-portal-error");

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      area = "unknown",
      message = "Brak opisu błędu",
      details = "",
      url = "",
      user_agent = "",
    } = body || {};

    const key = `${area}|${message}`.slice(0, 200);
    const now = Date.now();
    const last = recentlySent.get(key) || 0;
    if (now - last < THROTTLE_MS) {
      return new Response(JSON.stringify({ ok: true, throttled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    recentlySent.set(key, now);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!emailSettings || !smtpPassword) {
      console.error("Brak konfiguracji SMTP — pomijam wysyłkę");
      return new Response(JSON.stringify({ ok: false, reason: "smtp_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderName = emailSettings.sender_name || "GetRido";
    const senderEmail = emailSettings.sender_email || emailSettings.smtp_user;
    const port = emailSettings.smtp_port || 587;
    const useTls = port === 465;

    const client = new SMTPClient({
      connection: {
        hostname: emailSettings.smtp_host || "getrido.pl",
        port,
        tls: useTls,
        auth: {
          username: emailSettings.smtp_user || senderEmail,
          password: smtpPassword,
        },
      },
    });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#4A3AFF">⚠️ Błąd w portalu GetRido</h2>
        <p><strong>Obszar:</strong> ${escapeHtml(area)}</p>
        <p><strong>Komunikat:</strong> ${escapeHtml(message)}</p>
        ${url ? `<p><strong>URL:</strong> ${escapeHtml(url)}</p>` : ""}
        ${details ? `<pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;font-size:12px">${escapeHtml(details)}</pre>` : ""}
        ${user_agent ? `<p style="color:#666;font-size:11px"><strong>UA:</strong> ${escapeHtml(user_agent)}</p>` : ""}
        <p style="color:#666;font-size:11px">Wysłano automatycznie: ${new Date().toISOString()}</p>
      </div>
    `;

    // qmail (LH.pl) odrzuca maile z gołym LF (451 smtplf) — całość musi mieć CRLF
    const toCRLF = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: [ADMIN_EMAIL],
      replyTo: senderEmail,
      subject: `[GetRido][BŁĄD] ${area}: ${message}`.slice(0, 180),
      content: toCRLF(`Błąd w obszarze ${area}: ${message}\n\n${details}\nURL: ${url}`),
      html: toCRLF(html),
      headers: { "X-Mailer": "GetRido ErrorReport" },
    });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("report-portal-error failed:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

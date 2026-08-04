// Diagnostyczna funkcja: wysyła test e-mail i zwraca PEŁNĄ odpowiedź SMTP serwera
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  return phaseABlockedResponse(req, "email-probe");

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to } = await req.json();
    if (!to) throw new Error("Brak 'to'");

    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) throw new Error("SMTP_PASSWORD nieustawione");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: s } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    const host = s?.smtp_host || "mail-serwer408603.lh.pl";
    const port = s?.smtp_port || 465;
    const user = s?.smtp_user || "noreply@getrido.pl";
    const sender = `${s?.sender_name || "GetRido"} <${s?.sender_email || user}>`;

    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass: smtpPassword },
      logger: true,
      debug: true,
    } as any);

    const verifyResult = await transporter.verify().catch((e: any) => `VERIFY ERROR: ${e.message}`);

    const info = await transporter.sendMail({
      from: sender,
      to,
      subject: `PROBE TEST ${new Date().toISOString()}`,
      text: "To jest test diagnostyczny SMTP z GetRido.",
      html: "<p>To jest <b>test diagnostyczny SMTP</b> z GetRido.</p>",
    });

    return new Response(JSON.stringify({
      success: true,
      verify: verifyResult,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected,
      pending: info.pending,
      envelope: info.envelope,
      smtp: { host, port, user, sender },
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message,
      stack: e.stack,
      code: e.code,
      response: e.response,
      responseCode: e.responseCode,
    }, null, 2), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

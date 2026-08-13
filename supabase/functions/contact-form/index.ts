// Publiczny formularz kontaktowy (/kontakt).
// Zapisuje zgłoszenie do contact_messages i wysyła mail na skrzynkę firmową
// przez wspólny mechanizm SMTP (_shared/smtpSend.ts — email_settings + SMTP_PASSWORD).
// Ochrona: honeypot (pole "website") + rate limit po IP (5 zgłoszeń / godzinę).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail, emailShell } from "../_shared/smtpSend.ts";

// Skrzynka docelowa — odpowiednik LEGAL_ENTITY.email z src/config/legal.ts
// (edge function nie ma dostępu do configu frontendu).
const CONTACT_EMAIL = "kontakt@getrido.pl";
const RATE_LIMIT_PER_HOUR = 5;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const { name, email, phone, city, message, website } = await req.json();

    // Honeypot: pole "website" jest ukryte w UI — wypełnia je tylko bot.
    // Odpowiadamy sukcesem, żeby nie zdradzać mechanizmu.
    if (typeof website === "string" && website.trim() !== "") {
      return json({ success: true });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 200) {
      return json({ success: false, error: "Podaj imię i nazwisko." }, 400);
    }
    if (typeof email !== "string" || !emailRegex.test(email) || email.length > 320) {
      return json({ success: false, error: "Podaj prawidłowy adres e-mail." }, 400);
    }
    if (typeof message !== "string" || message.trim().length < 5 || message.length > 5000) {
      return json({ success: false, error: "Wiadomość musi mieć od 5 do 5000 znaków." }, 400);
    }
    if ((phone != null && typeof phone !== "string") || (phone?.length ?? 0) > 30) {
      return json({ success: false, error: "Nieprawidłowy numer telefonu." }, 400);
    }
    if ((city != null && typeof city !== "string") || (city?.length ?? 0) > 120) {
      return json({ success: false, error: "Nieprawidłowa miejscowość." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const userAgent = req.headers.get("user-agent") ?? null;

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", hourAgo);
    if (countError) throw countError;
    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return json(
        { success: false, error: "Zbyt wiele zgłoszeń. Spróbuj ponownie za godzinę lub napisz bezpośrednio na " + CONTACT_EMAIL + "." },
        429,
      );
    }

    const { error: insertError } = await supabase.from("contact_messages").insert({
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      city: city?.trim() || null,
      message: message.trim(),
      ip,
      user_agent: userAgent,
    });
    if (insertError) throw insertError;

    const bodyHtml = `
      <p><strong>Nowa wiadomość z formularza kontaktowego getrido.pl</strong></p>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Imię i nazwisko:</td><td style="padding:4px 0;">${escapeHtml(name.trim())}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">E-mail:</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(email.trim())}">${escapeHtml(email.trim())}</a></td></tr>
        ${phone?.trim() ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Telefon:</td><td style="padding:4px 0;">${escapeHtml(phone.trim())}</td></tr>` : ""}
        ${city?.trim() ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Miasto:</td><td style="padding:4px 0;">${escapeHtml(city.trim())}</td></tr>` : ""}
      </table>
      <p style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">${escapeHtml(message.trim())}</p>
      <p style="color:#6b7280;font-size:12px;">IP: ${escapeHtml(ip)}</p>`;

    await sendMail(
      CONTACT_EMAIL,
      `Formularz kontaktowy: ${name.trim()}`,
      emailShell("Nowa wiadomość z formularza kontaktowego", bodyHtml),
    );

    return json({ success: true });
  } catch (err) {
    console.error("contact-form error:", err);
    return json(
      { success: false, error: "Nie udało się wysłać wiadomości. Napisz bezpośrednio na " + CONTACT_EMAIL + "." },
      500,
    );
  }
});

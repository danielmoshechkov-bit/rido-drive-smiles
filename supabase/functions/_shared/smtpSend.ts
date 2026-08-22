// Wspólny wysyłacz maili (SMTP getrido.pl) — ta sama konfiguracja co
// send-fleet-registration-email (email_settings + sekret SMTP_PASSWORD).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

/**
 * Załącznik maila. `content` w base64 — denomailer sam go osadzi.
 */
export interface Zalacznik {
  nazwa: string;
  typ: string;      // np. "application/pdf"
  base64: string;
}

export interface OpcjeMaila {
  /**
   * Adres, na który trafi odpowiedź klienta.
   *
   * Nadawcą jest `noreply@getrido.pl` i tak zostaje — ale klient, który dostaje
   * maila w skrzynce, odpisuje odruchowo, nie loguje się do panelu. Bez tego
   * pola jego odpowiedź szłaby na skrzynkę, do której nikt nie zagląda.
   */
  replyTo?: string;
  zalaczniki?: Zalacznik[];
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  opcje: OpcjeMaila = {},
): Promise<void> {
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");
  if (!smtpPassword) throw new Error("SMTP_PASSWORD nie jest skonfigurowany");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: s } = await supabase
    .from("email_settings")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();

  const senderName = s?.sender_name || "GetRido";
  const senderEmail = s?.sender_email || s?.smtp_user || "noreply@getrido.pl";
  const port = s?.smtp_port || 587;

  const client = new SMTPClient({
    connection: {
      hostname: s?.smtp_host || "getrido.pl",
      port,
      tls: port === 465,
      auth: { username: s?.smtp_user || "kontakt@getrido.pl", password: smtpPassword },
    },
  });

  const minified = html.replace(/\r\n/g, "\n").replace(/\n\s+/g, " ").replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
  await client.send({
    from: `${senderName} <${senderEmail}>`,
    to: [to],
    subject,
    content: "Twoja przeglądarka nie obsługuje HTML.",
    html: minified,
    // Oba pola są opcjonalne, więc czterej dotychczasowi wywołujący
    // (billing-price-guarantee, contact-form, dwie od zmiany konta kierowcy)
    // nie zauważają różnicy.
    ...(opcje.replyTo ? { replyTo: opcje.replyTo } : {}),
    ...(opcje.zalaczniki?.length
      ? {
          attachments: opcje.zalaczniki.map((z) => ({
            filename: z.nazwa,
            contentType: z.typ,
            encoding: "base64" as const,
            content: z.base64,
          })),
        }
      : {}),
  });
  await client.close();
}

// Prosty, brandowany szablon maila (spójny z resztą GetRido).
export function emailShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Verdana,sans-serif;background:#f4f4f5;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;">
<table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1);">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:32px 30px;text-align:center;">
<img src="https://getrido.pl/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="GetRido" style="height:48px;margin-bottom:14px;">
<h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">${title}</h1></td></tr>
<tr><td style="padding:32px 30px;color:#374151;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
<tr><td style="background:#f9fafb;padding:24px 30px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="color:#6b7280;font-size:12px;margin:0;">Ta wiadomość została wysłana automatycznie. © 2026 GetRido.</p></td></tr>
</table></td></tr></table></body></html>`;
}

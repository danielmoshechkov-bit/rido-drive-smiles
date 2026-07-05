// Kierowca zgłasza zmianę numeru konta → tworzymy żądanie z tokenem (ważne 24 h)
// i wysyłamy mail z linkiem potwierdzającym. Numer zmienia się DOPIERO po kliknięciu
// linku (edge 'driver-bank-change-confirm'). Stary numer obowiązuje do potwierdzenia.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail, emailShell } from "../_shared/smtpSend.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace("Bearer ", "");
    if (!accessToken) return json({ error: "Brak autoryzacji" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(accessToken);
    const userId = (claimsData as any)?.claims?.sub;
    if (claimsError || !userId) return json({ error: "Sesja wygasła, zaloguj się ponownie" }, 401);

    const { new_iban } = await req.json();
    const clean = String(new_iban || "").replace(/\s/g, "");
    if (clean.replace(/^PL/i, "").replace(/\D/g, "").length < 22) {
      return json({ error: "Nieprawidłowy numer konta (IBAN)" }, 400);
    }

    // Kierowca przypisany do zalogowanego usera
    const { data: link } = await svc.from("driver_app_users").select("driver_id").eq("user_id", userId).maybeSingle();
    const driverId = (link as any)?.driver_id;
    if (!driverId) return json({ error: "Nie znaleziono kierowcy dla tego konta" }, 404);

    const { data: driver } = await svc.from("drivers").select("id, first_name, last_name, email").eq("id", driverId).maybeSingle();
    const driverEmail = (driver as any)?.email;
    if (!driverEmail) return json({ error: "Brak adresu e-mail kierowcy — uzupełnij e-mail lub zgłoś do floty" }, 400);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await svc.from("driver_bank_change_requests").insert({
      driver_id: driverId, new_iban: clean, token, email: driverEmail, expires_at: expiresAt,
    });
    if (insErr) throw insErr;

    const confirmLink = `https://getrido.pl/kierowca/potwierdz-konto/${token}`;
    const body = `
      <p>Otrzymaliśmy prośbę o zmianę numeru konta bankowego na:</p>
      <p style="font-size:18px;font-weight:700;color:#111;letter-spacing:1px;">${clean}</p>
      <p>Aby <strong>potwierdzić zmianę</strong>, kliknij przycisk poniżej:</p>
      <table role="presentation" style="width:100%;"><tr><td style="text-align:center;padding:16px 0;">
        <a href="${confirmLink}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:600;">✅ Potwierdź nowy numer konta</a>
      </td></tr></table>
      <p style="color:#b91c1c;font-weight:600;">Link jest ważny 24 godziny.</p>
      <p style="color:#6b7280;font-size:13px;">Jeśli to nie Ty prosiłeś o zmianę — zignoruj tę wiadomość, numer konta pozostanie bez zmian.</p>
      <p style="color:#7c3aed;font-size:12px;word-break:break-all;">${confirmLink}</p>`;
    await sendMail(driverEmail, "Potwierdź zmianę numeru konta — GetRido", emailShell("Potwierdź zmianę numeru konta", body));

    // maskowany e-mail do komunikatu w UI
    const [u, d] = driverEmail.split("@");
    const masked = `${u.slice(0, 2)}***@${d}`;
    return json({ success: true, email: masked });
  } catch (e: any) {
    console.error("[driver-bank-change-request]", e);
    return json({ error: e.message || "Błąd serwera" }, 500);
  }
});

// Potwierdzenie zmiany numeru konta po kliknięciu linku z maila (publiczne, po tokenie).
// Dopiero TU realnie zmieniamy drivers.iban (+ bank_account sync) i powiadamiamy flotę mailem.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendMail, emailShell } from "../_shared/smtpSend.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token } = await req.json();
    if (!token) return json({ error: "Brak tokenu" }, 400);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: reqRow } = await svc.from("driver_bank_change_requests").select("*").eq("token", token).maybeSingle();
    if (!reqRow) return json({ error: "Link nieprawidłowy lub już użyty" }, 404);
    if ((reqRow as any).confirmed_at) return json({ success: true, already: true });
    if (new Date((reqRow as any).expires_at) < new Date()) return json({ error: "Link wygasł (był ważny 24 h). Zgłoś zmianę ponownie." }, 410);

    const driverId = (reqRow as any).driver_id;
    const newIban = (reqRow as any).new_iban;

    const { error: updErr } = await svc.from("drivers").update({ iban: newIban, bank_account: newIban }).eq("id", driverId);
    if (updErr) throw updErr;
    await svc.from("driver_bank_change_requests").update({ confirmed_at: new Date().toISOString() }).eq("id", (reqRow as any).id);

    // Powiadomienie e-mail do floty (anti-fraud): kto + kiedy
    const { data: driver } = await svc.from("drivers").select("first_name, last_name, fleet_id").eq("id", driverId).maybeSingle();
    const driverName = `${(driver as any)?.first_name || ""} ${(driver as any)?.last_name || ""}`.trim() || "Kierowca";
    const fleetId = (driver as any)?.fleet_id;
    if (fleetId) {
      const { data: fleet } = await svc.from("fleets").select("email, name").eq("id", fleetId).maybeSingle();
      const fleetEmail = (fleet as any)?.email;
      if (fleetEmail) {
        const when = new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
        const body = `
          <p>Kierowca <strong>${driverName}</strong> zmienił numer konta bankowego.</p>
          <p><strong>Data:</strong> ${when}</p>
          <p><strong>Nowy numer:</strong> <span style="font-weight:700;color:#111;">${newIban}</span></p>
          <p style="color:#6b7280;font-size:13px;">Od teraz przelewy generowane dla tego kierowcy pójdą na nowy numer. Jeśli zmiana wygląda podejrzanie — skontaktuj się z kierowcą.</p>`;
        try { await sendMail(fleetEmail, `Zmiana numeru konta — ${driverName}`, emailShell("Kierowca zmienił numer konta", body)); }
        catch (mailErr) { console.error("[confirm] mail do floty nieudany", mailErr); }
      }
    }

    return json({ success: true, driverName });
  } catch (e: any) {
    console.error("[driver-bank-change-confirm]", e);
    return json({ error: e.message || "Błąd serwera" }, 500);
  }
});

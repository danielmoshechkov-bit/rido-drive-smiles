import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCES = [
  { url: "https://ksef.podatki.gov.pl/komunikaty-techniczne/", name: "Komunikaty techniczne MF" },
  { url: "https://ksef.podatki.gov.pl/etapy-wdrozenia-ksef/", name: "Harmonogram wdrożenia KSeF" },
  { url: "https://ksef.podatki.gov.pl/ksef-na-okres-obligatoryjny/wsparcie-dla-integratorow/", name: "Wsparcie dla integratorów KSeF 2.0" },
];

const SYSTEM_PROMPT = `Jesteś agentem monitorującym KSeF dla polskiego portalu fakturowego GetRido. Przeanalizuj treść strony i wykryj informacje ISTOTNE dla oprogramowania fakturowego: zmiany w API, nowe wersje, zmiany XML FA(3), awarie, nowe terminy obowiązkowe.
Zwróć WYŁĄCZNIE czysty JSON:
{"has_changes": boolean, "summary": "max 2 zdania po polsku", "alerts": [{"severity": "critical"|"warning"|"info", "title": "tytuł", "description": "opis", "action_required": "akcja lub null"}]}
Jeśli brak zmian: {"has_changes": false, "summary": "Brak nowych informacji", "alerts": []}`;

const APP_BASE_URL = "https://rido-drive-smiles.lovable.app";
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signUnsubscribeToken(email: string) {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Brak SUPABASE_SERVICE_ROLE_KEY");

  const payload = encoder.encode(JSON.stringify({ email, type: "ksef-unsubscribe" }));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return `${toBase64Url(payload)}.${toBase64Url(signature)}`;
}

async function buildUnsubscribeUrl(email: string) {
  const token = await signUnsubscribeToken(email);
  return `${APP_BASE_URL}/functions/v1/ksef-unsubscribe?token=${encodeURIComponent(token)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const startTime = Date.now();

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Brak ANTHROPIC_API_KEY" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const allAlerts: any[] = [];
    let sourcesChecked = 0;

    for (const source of SOURCES) {
      try {
        const res = await fetch(source.url, { headers: { "User-Agent": "GetRido-KSeF-Monitor/1.0" }, signal: AbortSignal.timeout(10000) });
        const html = await res.text();
        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 800,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: `Źródło: ${source.name}\n\n${text}` }],
          }),
        });
        const aiData = await aiRes.json();
        const raw = aiData.content?.[0]?.text?.replace(/```json|```/g, "").trim();
        const result = JSON.parse(raw || '{"has_changes":false,"alerts":[]}');

        if (result.has_changes && result.alerts?.length) {
          for (const alert of result.alerts) {
            const { data: existing } = await supabase.from("ksef_monitor_alerts")
              .select("id").eq("title", alert.title).is("user_id", null)
              .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .maybeSingle();

            if (!existing) {
              await supabase.from("ksef_monitor_alerts").insert({
                user_id: null,
                severity: alert.severity,
                title: alert.title,
                description: alert.description,
                action_required: alert.action_required,
                source: source.name,
                source_url: source.url,
                is_read: false,
              });
              allAlerts.push({ ...alert, source: source.name });
            }
          }
        }
        sourcesChecked++;
      } catch (e) { console.error(`Błąd dla ${source.url}:`, e); }
    }

    await supabase.from("ksef_monitor_scans").insert({
      user_id: null,
      status: "ok",
      sources_checked: sourcesChecked,
      alerts_found: allAlerts.length,
      duration_ms: Date.now() - startTime,
    });

    if (allAlerts.length > 0 && RESEND_API_KEY) {
      const { data: emailList } = await supabase.from("ksef_alert_emails").select("email").eq("active", true);
      const emails = (emailList || []).map((r: any) => r.email).filter(Boolean);

      if (emails.length > 0) {
        const critCount = allAlerts.filter((a) => a.severity === "critical").length;
        const subject = critCount > 0 ? `🚨 KSeF Monitor — wykryto ${critCount} krytyczną zmianę` : `⚠️ KSeF Monitor GetRido — ${allAlerts.length} nowych informacji`;

        for (const email of emails) {
          const unsubscribeUrl = await buildUnsubscribeUrl(email);
          const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <h2>🔔 KSeF Monitor — GetRido</h2>
            <p>Nasz bot AI wykrył ${allAlerts.length} nowych informacji w systemie KSeF (${new Date().toLocaleDateString("pl-PL")}):</p>
            ${allAlerts.map((a) => `
              <div style="border-left:4px solid ${a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6'};padding:12px;margin:8px 0;background:#f9fafb;border-radius:4px">
                <strong>${a.title}</strong><br>${a.description || ""}
                ${a.action_required ? `<br><span style="color:#ef4444">→ Wymagana akcja: ${a.action_required}</span>` : ""}
                <br><small style="color:#6b7280">Źródło: ${a.source}</small>
              </div>
            `).join("")}
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">GetRido — automatyczny monitoring KSeF. getrido.pl</p>
            <div style="margin-top:16px">
              <a href="${unsubscribeUrl}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600">Wypisz się z tych maili</a>
            </div>
          </div>`;

          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: "ksef@getrido.pl", to: email, subject, html }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sources_checked: sourcesChecked, alerts_found: allAlerts.length, duration_ms: Date.now() - startTime }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await supabase.from("ksef_monitor_scans").insert({ user_id: null, status: "error", sources_checked: 0, alerts_found: 0, duration_ms: Date.now() - startTime });
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

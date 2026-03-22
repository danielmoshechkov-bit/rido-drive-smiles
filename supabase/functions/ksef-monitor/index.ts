import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOURCES = [
  { url: "https://ksef.podatki.gov.pl/komunikaty-techniczne/", name: "Komunikaty techniczne MF" },
  { url: "https://ksef.podatki.gov.pl/etapy-wdrozenia-ksef/", name: "Harmonogram wdrożenia KSeF" },
  { url: "https://ksef.podatki.gov.pl/ksef-na-okres-obligatoryjny/wsparcie-dla-integratorow/", name: "Dokumentacja API KSeF 2.0" },
];

const SYSTEM_PROMPT = `Jesteś agentem monitorującym Krajowy System e-Faktur (KSeF) dla polskiego portalu fakturowego.

Przeanalizuj treść strony i zidentyfikuj informacje ISTOTNE dla oprogramowania fakturowego.
Interesują Cię: zmiany w API, nowe wersje API, zmiany w strukturze XML FA(3), awarie, nowe terminy.

Zwróć WYŁĄCZNIE czysty JSON bez komentarzy i backticks:
{
  "has_changes": boolean,
  "summary": "max 2 zdania po polsku",
  "alerts": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "krótki tytuł",
      "description": "co się zmieniło",
      "action_required": "konkretna akcja techniczna lub null"
    }
  ]
}

CRITICAL: zmiana wersji API, nowe wymagane pola FA(3), zmiana endpointów, awaria KSeF.
WARNING: nowe opcjonalne pola, zbliżające się terminy ≤30 dni, zmiany certyfikatów.
INFO: bez wpływu na kod, komunikaty informacyjne, terminy >30 dni.

Jeśli brak istotnych informacji: {"has_changes": false, "summary": "Brak zmian", "alerts": []}`;

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "GetRido-KSeF-Monitor/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  const html = await res.text();
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startTime = Date.now();

  try {
    let userId: string | null = null;
    try {
      const body = await req.json();
      userId = body.user_id || null;
    } catch { /* no body */ }

    const settingsQuery = userId
      ? supabase.from("ksef_monitor_config").select("*").eq("user_id", userId).single()
      : supabase.from("ksef_monitor_config").select("*").eq("scan_enabled", true).limit(1).single();

    const { data: settings, error: settingsError } = await settingsQuery;

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "Brak konfiguracji KSeF Monitor" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUserId = settings.user_id;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Brak ANTHROPIC_API_KEY w sekretach" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("ksef_monitor_config").update({ last_scan_status: "running" }).eq("id", settings.id);

    const allAlerts: any[] = [];
    let sourcesChecked = 0;

    for (const source of SOURCES) {
      try {
        const text = await fetchPage(source.url);

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: `Źródło: ${source.name}\n\nTreść:\n${text}` }],
          }),
        });

        const aiData = await aiRes.json();
        const raw = aiData.content?.[0]?.text?.replace(/```json|```/g, "").trim();
        const result = JSON.parse(raw || '{"has_changes":false,"summary":"Brak danych","alerts":[]}');

        if (result.has_changes && result.alerts?.length) {
          for (const alert of result.alerts) {
            await supabase.from("ksef_monitor_alerts").insert({
              user_id: targetUserId,
              severity: alert.severity,
              title: alert.title,
              description: alert.description,
              action_required: alert.action_required,
              source: source.name,
              source_url: source.url,
            });

            const shouldNotify =
              (alert.severity === "critical" && settings.notify_critical) ||
              (alert.severity === "warning" && settings.notify_warning) ||
              (alert.severity === "info" && settings.notify_info);
            if (shouldNotify) allAlerts.push(alert);
          }
        }
        sourcesChecked++;
      } catch (e) {
        console.error(`Error for ${source.url}:`, e);
      }
    }

    const duration = Date.now() - startTime;

    await supabase.from("ksef_monitor_scans").insert({
      user_id: targetUserId,
      status: "ok",
      sources_checked: sourcesChecked,
      alerts_found: allAlerts.length,
      duration_ms: duration,
    });

    await supabase.from("ksef_monitor_config").update({
      last_scan_at: new Date().toISOString(),
      last_scan_status: "ok",
      last_scan_alerts_count: allAlerts.length,
    }).eq("id", settings.id);

    // Send alert email if configured
    if (allAlerts.length > 0 && settings.alert_email) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (RESEND_API_KEY) {
        const critCount = allAlerts.filter((a: any) => a.severity === "critical").length;
        const subject = critCount > 0
          ? `🚨 KSeF Monitor — ${critCount} KRYTYCZNY alert`
          : `⚠️ KSeF Monitor — ${allAlerts.length} alert(y)`;

        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2>KSeF AI Monitor — Get Rido</h2>
          <p>Skan z ${new Date().toLocaleString("pl-PL")}:</p>
          ${allAlerts.map((a: any) => `
            <div style="border-left:4px solid ${a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6'};padding:12px;margin:8px 0;background:#f9fafb;border-radius:4px">
              <strong>${a.title}</strong><br>${a.description || ''}
              ${a.action_required ? `<br><span style="color:#ef4444">→ ${a.action_required}</span>` : ''}
            </div>
          `).join("")}
        </div>`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "ksef-monitor@getrido.pl", to: settings.alert_email, subject, html }),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, sources_checked: sourcesChecked, alerts_found: allAlerts.length, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("KSeF monitor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

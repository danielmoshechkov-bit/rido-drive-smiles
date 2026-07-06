// ============================================================================
// voice-call-postprocess — POST-CALL WEBHOOK z ElevenLabs (po zakończonej rozmowie).
// Bierze transkrypt z payloadu i przekazuje do voice-call-analyze (zapis transkryptu,
// analiza, UCZENIE, powiązanie ze zleceniem). is_test=false dla realnych telefonów.
//
// URL (w ustawieniach agenta ElevenLabs jako Post-call webhook):
//   .../functions/v1/voice-call-postprocess?provider_id=<UUID>&persona_key=workshop_secretary
//
// Auth: podpis HMAC ElevenLabs (nagłówek elevenlabs-signature: "t=...,v0=..."),
// sekret ELEVENLABS_WEBHOOK_SECRET (ai_secret_store / Supabase Secrets), fail-closed.
// Bez ważnego podpisu payload NIE trafia do warstwy uczenia (ochrona przed
// zatruciem voice_agent_knowledge fałszywym transkryptem).
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, elevenlabs-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const tenc = new TextEncoder();
function timingSafeEqual(a: string, b: string): boolean {
  const ab = tenc.encode(a), bb = tenc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Podpis ElevenLabs: v0 == HMAC-SHA256(secret, `${t}.${rawBody}`) hex; t nie starszy niż 30 min.
async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const seg of header.split(",")) {
    const i = seg.indexOf("=");
    if (i > 0) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  const t = parts["t"], v0 = parts["v0"];
  if (!t || !v0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 1800) return false;
  const key = await crypto.subtle.importKey("raw", tenc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, tenc.encode(`${t}.${rawBody}`)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, v0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const providerId = url.searchParams.get("provider_id") || "";
    const personaKey = url.searchParams.get("persona_key") || "workshop_secretary";

    // Weryfikacja podpisu NA SUROWYM body (przed parsowaniem JSON), fail-closed.
    const rawBody = await req.text();
    const webhookSecret = await getSecret(admin, "ELEVENLABS_WEBHOOK_SECRET");
    if (!webhookSecret) return json({ ok: false, error: "ELEVENLABS_WEBHOOK_SECRET nie skonfigurowany — webhook zablokowany" }, 503);
    if (!(await verifySignature(rawBody, req.headers.get("elevenlabs-signature"), webhookSecret))) {
      return json({ ok: false, error: "invalid signature" }, 401);
    }

    let payload: any = {};
    try { payload = JSON.parse(rawBody); } catch (_) { /* pusty payload */ }
    // ElevenLabs post-call: transkrypt bywa w data.transcript / transcript (role agent|user, message)
    const rawTranscript = payload?.data?.transcript || payload?.transcript || payload?.conversation?.transcript || [];
    const messages = (Array.isArray(rawTranscript) ? rawTranscript : [])
      .map((t: any) => ({
        role: (t?.role === "agent" || t?.role === "assistant") ? "assistant" : "user",
        content: t?.message || t?.text || t?.content || "",
      }))
      .filter((m: any) => m.content);

    if (messages.length < 2) return json({ ok: true, skipped: "brak transkryptu" });

    const r = await fetch(`${supabaseUrl}/functions/v1/voice-call-analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({ provider_id: providerId, persona_key: personaKey, messages, is_test: false }),
    });
    const out = await r.json().catch(() => ({}));
    return json({ ok: true, analyzed: out?.ok || false, call_id: out?.call_id || null, lessons: out?.lessons_learned || 0 });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

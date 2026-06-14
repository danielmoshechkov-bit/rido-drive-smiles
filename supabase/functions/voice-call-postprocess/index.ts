// ============================================================================
// voice-call-postprocess — POST-CALL WEBHOOK z ElevenLabs (po zakończonej rozmowie).
// Bierze transkrypt z payloadu i przekazuje do voice-call-analyze (zapis transkryptu,
// analiza, UCZENIE, powiązanie ze zleceniem). is_test=false dla realnych telefonów.
//
// URL (w ustawieniach agenta ElevenLabs jako Post-call webhook):
//   .../functions/v1/voice-call-postprocess?provider_id=<UUID>&persona_key=workshop_secretary
//
// HARDENING: ElevenLabs może podpisywać webhook (HMAC) — weryfikację dodać przed
// produkcją. [TODO]
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, elevenlabs-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const url = new URL(req.url);
    const providerId = url.searchParams.get("provider_id") || "";
    const personaKey = url.searchParams.get("persona_key") || "workshop_secretary";

    const payload = await req.json().catch(() => ({}));
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

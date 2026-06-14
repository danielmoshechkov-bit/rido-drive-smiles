// ============================================================================
// voice-agent-llm — CUSTOM LLM dla ElevenLabs Conversational AI.
// ElevenLabs wysyła żądanie w formacie OpenAI (/v1/chat/completions, SSE).
// My w środku wołamy NASZ mózg (voice-agent-chat) z personą + danymi firmy +
// wiedzą + narzędziami (rezerwacja/zlecenie). Inteligencja i dane zostają u nas.
//
// URL (per tenant, w ustawieniach agenta ElevenLabs jako "Custom LLM"):
//   .../functions/v1/voice-agent-llm?provider_id=<UUID>&persona_key=workshop_secretary
//
// Auth: na start bez twardego tokenu (verify_jwt=false). HARDENING przed produkcją:
//   dodać ?token= sprawdzany z sekretem (VOICE_LLM_TOKEN). [TODO]
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ ok: true, service: "voice-agent-llm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider_id") || "";
  const personaKey = url.searchParams.get("persona_key") || "workshop_secretary";

  const reqBody = await req.json().catch(() => ({}));
  const stream = reqBody?.stream !== false;
  const model = reqBody?.model || "rido-claude";
  const inMessages: any[] = Array.isArray(reqBody?.messages) ? reqBody.messages : [];

  // Wyciągnij rozmowę (user/assistant); system od ElevenLabs ignorujemy — mózg buduje własny.
  const convo = inMessages
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => c?.text || "").join(" ") : "",
    }))
    .filter((m) => m.content);

  // Konfiguracja tenanta (dane firmy, język, uprawnienia)
  let cfg: any = null;
  if (providerId) {
    const { data } = await admin.from("voice_agent_configs")
      .select("business_context, display_name, languages, calendar_access, orders_access, voice_id")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    cfg = data;
  }

  // Wywołaj nasz mózg (service-role)
  let reply = "Przepraszam, chwilowy problem techniczny.";
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/voice-agent-chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_id: providerId, persona_key: personaKey, test_mode: false,
        messages: convo,
        business_context: cfg?.business_context || {}, display_name: cfg?.display_name || "",
        languages: cfg?.languages || ["pl"], calendar_access: !!cfg?.calendar_access, orders_access: !!cfg?.orders_access,
      }),
    });
    const data = await r.json();
    if (data?.reply) reply = data.reply;
  } catch (_) { /* zwróć fallback reply */ }

  const id = "chatcmpl-" + Math.random().toString(36).slice(2);
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    const chunk = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: null }] };
    const done = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    const sse = `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
    return new Response(sse, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  const completion = { id, object: "chat.completion", created, model, choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  return new Response(JSON.stringify(completion), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

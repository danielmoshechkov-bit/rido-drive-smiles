// ============================================================================
// voice-agent-llm — CUSTOM LLM dla ElevenLabs Conversational AI.
// ElevenLabs wysyła żądanie w formacie OpenAI (/v1/chat/completions, SSE).
// My w środku wołamy NASZ mózg (voice-agent-chat) z personą + danymi firmy +
// wiedzą + narzędziami (rezerwacja/zlecenie). Inteligencja i dane zostają u nas.
//
// URL (per tenant, w ustawieniach agenta ElevenLabs jako "Custom LLM"):
//   .../functions/v1/voice-agent-llm?provider_id=<UUID>&persona_key=workshop_secretary
//
// Auth: token VOICE_LLM_TOKEN (ai_secret_store / Supabase Secrets), fail-closed.
//   W ElevenLabs token podaje się w polu "API key" konfiguracji Custom LLM
//   (trafia jako Authorization: Bearer) albo jako ?token= w URL.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";
import { buildVoiceContext } from "../_shared/voiceAgentContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const tenc = new TextEncoder();
function timingSafeEqual(a: string, b: string): boolean {
  const ab = tenc.encode(a), bb = tenc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return new Response(JSON.stringify({ ok: true, service: "voice-agent-llm" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  // ElevenLabs woła Custom LLM przez RELATYWNE rozwiązanie URL:  new URL("chat/completions", serverURL).
  // Zgodnie z RFC 3986 to (1) ZASTĘPUJE ostatni segment ścieżki i (2) ODRZUCA query string.
  // => provider_id/persona_key NIE mogą siedzieć w query (przepadną) — muszą być w ŚCIEŻCE.
  // Wymagany Server URL w EL (z KOŃCOWYM ukośnikiem!):
  //   .../functions/v1/voice-agent-llm/<provider_id>/<persona_key>/
  // EL wyśle wtedy POST na:
  //   .../functions/v1/voice-agent-llm/<provider_id>/<persona_key>/chat/completions
  // Kolejność źródeł: ŚCIEŻKA -> query (kompatybilność wsteczna/testy ręczne) -> nagłówek.
  const segs = url.pathname.split("/").filter(Boolean);
  const fnIdx = segs.indexOf("voice-agent-llm");
  const pathParams = fnIdx >= 0
    ? segs.slice(fnIdx + 1).filter((s) => s !== "chat" && s !== "completions")
    : [];
  const stripElSuffix = (v: string) => v.replace(/\/chat\/completions\/?$/i, "").trim();
  const providerId =
    pathParams[0] ||
    stripElSuffix(url.searchParams.get("provider_id") || "") ||
    (req.headers.get("x-provider-id") || "").trim();
  const personaKey =
    pathParams[1] ||
    stripElSuffix(url.searchParams.get("persona_key") || "") ||
    (req.headers.get("x-persona-key") || "").trim() ||
    "workshop_secretary";

  // Bez skonfigurowanego VOICE_LLM_TOKEN endpoint jest ZABLOKOWANY (fail-closed) —
  // otwarty Custom-LLM to darmowy Claude dla każdego, kto zna provider_id.
  const expectedToken = await getSecret(admin, "VOICE_LLM_TOKEN");
  if (!expectedToken) {
    return new Response(JSON.stringify({ error: "VOICE_LLM_TOKEN nie skonfigurowany — endpoint zablokowany" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const providedToken = stripElSuffix(url.searchParams.get("token") || "") || bearer;
  if (!providedToken || !timingSafeEqual(providedToken, expectedToken)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

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
      .select("business_context, display_name, languages, calendar_access, orders_access, voice_id, custom_prompt_override")
      .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle();
    cfg = data;
  }

  // Wspólne body do mózgu (service-role)
  const brainBody: any = {
    provider_id: providerId, persona_key: personaKey, test_mode: false,
    messages: convo,
    business_context: cfg?.business_context || {}, display_name: cfg?.display_name || "",
    languages: cfg?.languages || ["pl"], calendar_access: !!cfg?.calendar_access, orders_access: !!cfg?.orders_access,
  };
  const brainHeaders = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" };

  // Narzędzia SYSTEMOWE EL (end_call, transfer_to_number, language_detection) przychodzą w
  // reqBody.tools (P11 Faza 0 — logujemy, żeby zobaczyć czy EL je w ogóle przekazuje do custom-LLM).
  const elTools: any[] = Array.isArray(reqBody?.tools) ? reqBody.tools : [];
  console.log(`[voice-agent-llm] provider=${providerId} persona=${personaKey} stream=${stream} el_tools=[${elTools.map((t: any) => t?.function?.name || t?.name).filter(Boolean).join(",") || "brak"}]`);

  if (stream) {
    const t0 = Date.now();
    const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");
    const OUR_TOOLS = new Set(["check_availability", "create_booking", "create_order"]);
    const callTool = async (name: string, input: any) => {
      try {
        const tr = await fetch(`${supabaseUrl}/functions/v1/voice-agent-tools`, {
          method: "POST", headers: brainHeaders,
          body: JSON.stringify({ action: name, provider_id: providerId, persona_key: personaKey, is_test: false, ...input }),
        });
        return await tr.json();
      } catch (e) { return { ok: false, error: (e as Error).message }; }
    };
    // Narzędzia EL (OpenAI -> Anthropic), TYLKO systemowe (nie nasze) — by model mógł je wywołać.
    const elToolDefs = elTools
      .map((t: any) => (t?.type === "function" ? t.function : t))
      .filter((f: any) => f?.name && !OUR_TOOLS.has(f.name))
      .map((f: any) => ({ name: f.name, description: f.description || f.name, input_schema: f.parameters || { type: "object", properties: {} } }));

    const encoder = new TextEncoder();
    const cid = "chatcmpl-" + Math.random().toString(36).slice(2);
    const createdTs = Math.floor(Date.now() / 1000);
    const FILLERS = ["Chwileczkę.", "Dobrze.", "Rozumiem.", "Już notuję.", "Sekundę.", "Tak, oczywiście."];
    const rs = new ReadableStream({
      async start(controller) {
        const raw = (s: string) => controller.enqueue(encoder.encode(s));
        const chunk = (delta: any, finish: string | null = null) =>
          raw(`data: ${JSON.stringify({ id: cid, object: "chat.completion.chunk", created: createdTs, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
        // FILLER jako pierwszy token TREŚCI (EL liczy timeout do treści, nie do role) — kasowany gdy
        // realny tekst zdąży wcześniej. To zabija burzę retry EL (P2/P4/P10) bez komentarzy SSE.
        let gotText = false; let filler: number | undefined;
        const armFiller = () => { filler = setTimeout(() => { if (!gotText) chunk({ content: FILLERS[Math.floor(Math.random() * FILLERS.length)] + " " }); }, 550) as unknown as number; };
        const clearFiller = () => { if (filler !== undefined) { clearTimeout(filler); filler = undefined; } };
        let lastToolMsg = "";
        // NIGDY nie zapętlaj "problem techniczny": jedna grzeczna kwestia + koniec tury (P9d).
        const closeWith = (txt: string) => { try { clearFiller(); if (txt) chunk({ content: txt }); chunk({}, "stop"); raw("data: [DONE]\n\n"); } catch { /* noop */ } };
        try {
          chunk({ role: "assistant" });
          armFiller();
          // KONTEKST INLINE (bez hopu funkcja->funkcja) => mniej płaconych sekund EL.
          const ctx = await buildVoiceContext(admin, {
            personaKey, businessContext: cfg?.business_context, displayName: cfg?.display_name,
            languages: cfg?.languages, calendarAccess: !!cfg?.calendar_access, ordersAccess: !!cfg?.orders_access,
            providerId, voiceGender: cfg?.voice_gender || "", customPromptOverride: cfg?.custom_prompt_override,
          });
          const apiKey = cleanKey((await getSecret(admin, "ANTHROPIC_API_KEY")) || "");
          console.log(`[timing] ctx=${Date.now() - t0}ms model=${ctx.model} tools=${ctx.tools.length}+${elToolDefs.length}el`);
          if (!apiKey) { closeWith("Przepraszam, mam chwilowy problem — oddzwonimy do Pana."); controller.close(); return; }
          const toolDefs = [...ctx.tools, ...elToolDefs];
          const aConvo: any[] = convo.map((m) => ({ role: m.role, content: m.content }));

          const callAnthropic = async () => {
            const payload = JSON.stringify({
              model: ctx.model, max_tokens: 500, temperature: 0.6,
              system: [{ type: "text", text: ctx.system, cache_control: { type: "ephemeral" } }], // prompt-caching = szybszy TTFT
              messages: aConvo, stream: true, ...(toolDefs.length ? { tools: toolDefs } : {}),
            });
            const hdr = { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31", "Content-Type": "application/json" };
            let res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: hdr, body: payload });
            if (!res.ok && (res.status === 429 || res.status === 529)) { await new Promise((r) => setTimeout(r, 400)); res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: hdr, body: payload }); }
            return res;
          };

          for (let round = 0; round < 4; round++) {
            const aiRes = await callAnthropic();
            if (!aiRes.ok || !aiRes.body) {
              console.error(`[voice-agent-llm] anthropic ${aiRes.status} round=${round}`);
              // Błąd techniczny: potwierdź udane narzędzie albo grzecznie zakończ — NIGDY nie zapętlaj.
              closeWith(lastToolMsg || "Przepraszam, mam chwilowy problem — oddzwonimy do Pana."); controller.close(); return;
            }
            const reader = aiRes.body.getReader();
            const dec = new TextDecoder();
            let buf = ""; let stopReason: string | null = null; let streamDone = false;
            const toolBlocks: Record<number, { id: string; name: string; partial: string }> = {};
            while (!streamDone) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let nl: number;
              while ((nl = buf.indexOf("\n\n")) >= 0) {
                const blk = buf.slice(0, nl); buf = buf.slice(nl + 2);
                const dl = blk.split("\n").find((l) => l.startsWith("data:"));
                if (!dl) continue;
                const pl = dl.slice(5).trim();
                if (!pl) continue;
                let ev: any; try { ev = JSON.parse(pl); } catch { continue; }
                if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
                  toolBlocks[ev.index] = { id: ev.content_block.id, name: ev.content_block.name, partial: "" };
                } else if (ev.type === "content_block_delta") {
                  if (ev.delta?.type === "text_delta" && ev.delta.text) { if (!gotText) { clearFiller(); console.log(`[timing] firstToken=${Date.now() - t0}ms`); } gotText = true; chunk({ content: ev.delta.text }); }
                  else if (ev.delta?.type === "input_json_delta" && toolBlocks[ev.index]) { toolBlocks[ev.index].partial += ev.delta.partial_json || ""; }
                } else if (ev.type === "message_delta" && ev.delta?.stop_reason) { stopReason = ev.delta.stop_reason; }
                else if (ev.type === "message_stop") { streamDone = true; }
              }
            }
            const idxs = Object.keys(toolBlocks);
            if (stopReason === "tool_use" && idxs.length) {
              // Narzędzie SYSTEMOWE EL (end_call/transfer/...) — oddaj tool_call do EL i zakończ (EL przejmuje).
              const elIdx = idxs.find((i) => !OUR_TOOLS.has(toolBlocks[Number(i)].name));
              if (elIdx !== undefined) {
                const tb = toolBlocks[Number(elIdx)];
                let input: any = {}; try { input = JSON.parse(tb.partial || "{}"); } catch { /* keep {} */ }
                clearFiller();
                raw(`data: ${JSON.stringify({ id: cid, object: "chat.completion.chunk", created: createdTs, model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_" + Math.random().toString(36).slice(2), type: "function", function: { name: tb.name, arguments: JSON.stringify(input) } }] }, finish_reason: null }] })}\n\n`);
                raw(`data: ${JSON.stringify({ id: cid, object: "chat.completion.chunk", created: createdTs, model, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
                raw("data: [DONE]\n\n"); controller.close(); return;
              }
              // Nasze narzędzia — wykonaj i kontynuuj. Filler w luce wykonania (EL nie zawiesza).
              chunk({ content: FILLERS[Math.floor(Math.random() * FILLERS.length)] + " " });
              const assistantBlocks: any[] = []; const results: any[] = [];
              for (const i of idxs) {
                const tb = toolBlocks[Number(i)];
                let input: any = {}; try { input = JSON.parse(tb.partial || "{}"); } catch { /* keep {} */ }
                assistantBlocks.push({ type: "tool_use", id: tb.id, name: tb.name, input });
                const out = await callTool(tb.name, input);
                if (out?.ok && typeof out?.message === "string" && out.message) lastToolMsg = out.message;
                else if (out?.ok && tb.name === "create_booking" && input?.scheduled_date) lastToolMsg = `Zapisałem wizytę na ${input.scheduled_date}${input.scheduled_time ? " na godzinę " + input.scheduled_time : ""}. Wyślę SMS z potwierdzeniem.`;
                results.push({ type: "tool_result", tool_use_id: tb.id, content: JSON.stringify(out) });
              }
              aConvo.push({ role: "assistant", content: assistantBlocks });
              aConvo.push({ role: "user", content: results });
              continue;
            }
            break;
          }
          clearFiller(); chunk({}, "stop"); raw("data: [DONE]\n\n");
        } catch (_e) {
          console.error("[voice-agent-llm] stream error:", (_e as Error)?.stack || String(_e));
          closeWith(lastToolMsg || "Przepraszam, mam chwilowy problem — oddzwonimy do Pana.");
        }
        controller.close();
      },
    });
    return new Response(rs, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  // NON-STREAM: buforowana odpowiedź JSON (np. test EL ze stream:false).
  let reply = "Przepraszam, chwilowy problem techniczny.";
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/voice-agent-chat`, { method: "POST", headers: brainHeaders, body: JSON.stringify(brainBody) });
    const data = await r.json();
    if (data?.reply) reply = data.reply;
  } catch (_) { /* zwróć fallback reply */ }

  const id = "chatcmpl-" + Math.random().toString(36).slice(2);
  const created = Math.floor(Date.now() / 1000);
  const completion = { id, object: "chat.completion", created, model, choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  return new Response(JSON.stringify(completion), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

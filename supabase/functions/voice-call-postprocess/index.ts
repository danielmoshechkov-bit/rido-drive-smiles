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
    // Parametry w URL to już tylko FALLBACK. Podstawową drogą rozpoznania tenanta jest
    // agent_id z payloadu — inaczej każdemu klientowi trzeba by ręcznie sklejać URL
    // webhooka, co nie skaluje się przy wielu firmach. Webhook agenta był
    // skonfigurowany bez parametrów, więc provider_id był pusty, voice-call-analyze
    // odrzucał żądanie, a my i tak zwracaliśmy 200 — transkrypty ginęły bez śladu.
    const urlProviderId = url.searchParams.get("provider_id") || "";
    const urlPersonaKey = url.searchParams.get("persona_key") || "";

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

    // Identyfikatory rozmowy i agenta — ElevenLabs umieszcza je w kilku miejscach
    // zależnie od wersji payloadu, więc sprawdzamy wszystkie znane.
    const conversationId = String(
      payload?.data?.conversation_id || payload?.conversation_id ||
      payload?.data?.conversation?.conversation_id || "",
    );
    const agentId = String(
      payload?.data?.agent_id || payload?.agent_id ||
      payload?.data?.conversation?.agent_id || "",
    );

    // ROZPOZNANIE TENANTA: najpierw po agent_id, dopiero potem parametry z URL.
    let providerId = "";
    let personaKey = "";
    if (agentId) {
      const { data: cfg, error: cfgError } = await admin.from("voice_agent_configs")
        .select("provider_id, persona_key").eq("elevenlabs_agent_id", agentId).maybeSingle();
      if (cfgError) {
        console.warn("[voice-call-postprocess]", JSON.stringify({
          event: "tenant_lookup_failed", conversation_id: conversationId, code: cfgError.code,
        }));
      }
      if (cfg) {
        providerId = String(cfg.provider_id || "");
        personaKey = String(cfg.persona_key || "");
      }
    }
    const tenantSource = providerId ? "agent_id" : (urlProviderId ? "url" : "none");
    if (!providerId) {
      providerId = urlProviderId;
      personaKey = personaKey || urlPersonaKey;
    }
    if (!personaKey) personaKey = "workshop_secretary";

    // Nie da się ustalić tenanta — to BŁĄD, nie cichy sukces. ElevenLabs ma zobaczyć
    // 400 i zapisać niepowodzenie webhooka, żeby problem zgłosił się sam.
    if (!providerId) {
      console.error("[voice-call-postprocess]", JSON.stringify({
        event: "tenant_unresolved", conversation_id: conversationId,
        agent_id_present: !!agentId, url_param_present: !!urlProviderId,
      }));
      return json({
        ok: false,
        error: "Nie udało się ustalić firmy: agent_id nieznany i brak provider_id w URL",
        conversation_id: conversationId,
      }, 400);
    }

    if (messages.length < 2) {
      console.warn("[voice-call-postprocess]", JSON.stringify({
        event: "transcript_too_short", conversation_id: conversationId, turns: messages.length,
      }));
      return json({ ok: true, skipped: "brak transkryptu", conversation_id: conversationId });
    }

    // 1) COMMIT — zapis rozmowy. To jest krok KRYTYCZNY i idzie PIERWSZY.
    //
    // Kolejność nie jest kosmetyczna: analyze to uczenie, commit to rezerwacja,
    // zlecenie, grafik i SMS. Gdyby analyze padło pierwsze, zapis by nie powstał
    // przez awarię destylacji reguł.
    const commitStarted = performance.now();
    const commitRes = await fetch(`${supabaseUrl}/functions/v1/voice-call-commit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId, provider_id: providerId,
        transcript: rawTranscript,
        caller_id: payload?.data?.metadata?.phone_call?.external_number
          || payload?.data?.conversation_initiation_client_data?.dynamic_variables?.system__caller_id || null,
        started_at: payload?.data?.metadata?.start_time_unix_secs
          ? new Date(payload.data.metadata.start_time_unix_secs * 1000).toISOString() : undefined,
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: (e as Error).name }) } as unknown as Response));
    const commitOut = await commitRes.json().catch(() => ({}));
    console.info("[voice-call-postprocess]", JSON.stringify({
      event: "commit_done", conversation_id: conversationId,
      status: commitOut?.status || null, ok: commitRes.ok,
      ms: Math.round(performance.now() - commitStarted),
    }));

    // 2) ANALYZE — uczenie. BŁĄD TUTAJ NIE MOŻE WYWRÓCIĆ WEBHOOKA.
    //    Zapis jest już zrobiony; destylacja reguł jest dodatkiem.
    const r = await fetch(`${supabaseUrl}/functions/v1/voice-call-analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
      body: JSON.stringify({ provider_id: providerId, persona_key: personaKey, messages, is_test: false, conversation_id: conversationId }),
    });
    const out = await r.json().catch(() => ({}));

    // Błąd analizy propagujemy zamiast go połykać. Wcześniej zwracaliśmy ok:true
    // z analyzed:false, więc ElevenLabs widział 200 i nikt się nie dowiadywał,
    // że transkrypt nie został zapisany.
    // Awaria uczenia jest logowana, ale NIE wywraca webhooka — inaczej ElevenLabs
    // ponowiłby żądanie i commit poszedłby drugi raz. Idempotencja po
    // conversation_id by go obroniła, ale nie ma powodu jej testować bez potrzeby.
    if (!r.ok || out?.ok === false) {
      console.error("[voice-call-postprocess]", JSON.stringify({
        event: "analyze_failed", conversation_id: conversationId,
        status: r.status, tenant_source: tenantSource, error: String(out?.error || "").slice(0, 200),
      }));
    }

    console.info("[voice-call-postprocess]", JSON.stringify({
      event: "analyzed", conversation_id: conversationId, tenant_source: tenantSource,
      call_id: out?.call_id || null, lessons: out?.lessons_learned || 0,
    }));
    // O powodzeniu webhooka decyduje COMMIT, nie analyze.
    if (!commitRes.ok) {
      return json({
        ok: false, error: commitOut?.error || "voice-call-commit nie powiódł się",
        conversation_id: conversationId, commit: commitOut?.status || null,
      }, 502);
    }
    return json({
      ok: true, commit: commitOut?.status || null,
      analyzed: r.ok && out?.ok !== false,
      call_id: out?.call_id || null, lessons: out?.lessons_learned || 0,
      conversation_id: conversationId,
    });
  } catch (e) {
    console.error("[voice-call-postprocess]", JSON.stringify({
      event: "request_failed", error: (e as Error)?.name || "error",
    }));
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

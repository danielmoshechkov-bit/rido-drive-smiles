// ============================================================================
// voice-call-reconcile — SIATKA BEZPIECZEŃSTWA pod webhookiem po rozmowie.
//
// Od chwili wyłączenia create_booking i create_order z narzędzi modelu (06.08)
// webhook jest JEDYNYM źródłem zapisu. Gdy padnie, rozmowa przepada bez śladu —
// klient usłyszał „potwierdzenie przyjdzie SMS-em", a w systemie nie ma nic.
//
// Dowód, że to nie jest teoretyczne: 3 z 7 rozmów z 05.08 miały
// `elevenlabs_conversation_id = NULL`, czyli webhook ich nie dowiózł. Wtedy
// kosztowało to analizę. Teraz kosztowałoby klienta.
//
// Co robi: bierze rozmowy z ElevenLabs z ostatnich godzin, porównuje z bazą
// i domawia te, których brakuje. Idempotencja po `conversation_id` sprawia,
// że doprocesowanie rozmowy już zapisanej jest nieszkodliwe.
//
// Tylko odczyt po stronie ElevenLabs. Zapis wyłącznie przez voice-call-commit,
// czyli tą samą drogą co webhook — bez drugiej implementacji (zasada 19).
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const expected = await getPhase1Secret(admin, "VOICE_LLM_TOKEN");
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  // Okno domyślnie 3 h: cron chodzi co 15 minut, więc nawet kilkugodzinna awaria
  // webhooka zostanie nadrobiona, a zapytanie pozostaje tanie.
  const okno = Math.min(Number(body?.hours) || 3, 24);
  const dryRun = body?.dry_run === true;

  const elKey = await getPhase1Secret(admin, "ELEVENLABS_API_KEY");
  if (!elKey) return json({ error: "brak ELEVENLABS_API_KEY" }, 400);

  // Agenci i tenanci z konfiguracji — bez zaszywania identyfikatorów w kodzie,
  // żeby drugi warsztat działał bez zmiany tej funkcji.
  const { data: configs, error: cfgErr } = await admin.from("voice_agent_configs")
    .select("provider_id, persona_key, elevenlabs_agent_id")
    .not("elevenlabs_agent_id", "is", null);
  if (cfgErr) return json({ error: "konfiguracja: " + cfgErr.message }, 500);

  const odCzasu = Math.floor(Date.now() / 1000) - okno * 3600;
  const raport: Array<Record<string, unknown>> = [];

  for (const cfg of configs || []) {
    const agentId = String(cfg.elevenlabs_agent_id);
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100`,
      { headers: { "xi-api-key": cleanKey(elKey) }, signal: AbortSignal.timeout(20_000) },
    ).catch(() => null);
    if (!r?.ok) {
      console.error("[voice-call-reconcile]", JSON.stringify({ event: "elevenlabs_failed", agent: agentId.slice(-8) }));
      raport.push({ provider: cfg.provider_id, blad: "ElevenLabs niedostępny" });
      continue;
    }
    const lista = (await r.json())?.conversations || [];
    const swiezych = lista.filter((c: Record<string, unknown>) =>
      Number(c.start_time_unix_secs) >= odCzasu && c.status === "done");

    // Które z nich mają już zapis. Jedno zapytanie zamiast N.
    const ids = swiezych.map((c: Record<string, unknown>) => String(c.conversation_id));
    const { data: istniejace } = ids.length
      ? await admin.from("voice_calls").select("elevenlabs_conversation_id, linked_entity_id")
          .eq("provider_id", cfg.provider_id).in("elevenlabs_conversation_id", ids)
      : { data: [] };
    const zapisane = new Set((istniejace || []).filter((v) => v.linked_entity_id).map((v) => v.elevenlabs_conversation_id));

    const brakujace = swiezych.filter((c: Record<string, unknown>) => !zapisane.has(String(c.conversation_id)));
    const domowione: string[] = [];

    for (const c of brakujace) {
      const cid = String(c.conversation_id);
      if (dryRun) { domowione.push(cid); continue; }
      // Zapis idzie TĄ SAMĄ drogą co webhook. Idempotencja po conversation_id
      // sprawia, że wyścig z opóźnionym webhookiem jest nieszkodliwy.
      const cr = await fetch(`${supabaseUrl}/functions/v1/voice-call-commit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: cid, provider_id: cfg.provider_id }),
        signal: AbortSignal.timeout(60_000),
      }).catch(() => null);
      const out = await cr?.json().catch(() => ({}));
      domowione.push(`${cid}:${out?.rpc?.status || out?.status || "blad"}`);
    }

    raport.push({
      provider: cfg.provider_id,
      rozmow_w_oknie: swiezych.length,
      juz_zapisanych: zapisane.size,
      domowionych: domowione.length,
      szczegoly: domowione,
    });
  }

  const suma = raport.reduce((a, x) => a + (Number(x.domowionych) || 0), 0);
  // Milczący cron nie daje żadnej wiedzy. Logujemy ZAWSZE, także zero — brak wpisu
  // znaczyłby wtedy „cron nie chodzi", a nie „nie było czego domawiać".
  console.info("[voice-call-reconcile]", JSON.stringify({
    event: "reconcile", okno_h: okno, dry_run: dryRun, domowionych: suma, tenantow: raport.length,
  }));
  return json({ ok: true, okno_h: okno, dry_run: dryRun, domowionych: suma, raport });
});

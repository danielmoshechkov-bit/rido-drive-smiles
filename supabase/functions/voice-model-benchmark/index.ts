// ============================================================================
// voice-model-benchmark — POMIAR TTFT różnych modeli Z NASZEGO REGIONU.
//
// Po co osobna funkcja zamiast skryptu lokalnego: pytanie brzmi "ile kosztuje
// generacja Z NASZEGO ŚRODOWISKA", a nasze środowisko to Supabase eu-central-1
// (Frankfurt). Pomiar z laptopa w Polsce przeszedłby inną trasą sieciową i dał
// odpowiedź na inne pytanie. Przy okazji klucze zostają tam, gdzie są —
// nie wyciągamy ich do lokalnej powłoki.
//
// FUNKCJA TYMCZASOWA. Po rozstrzygnięciu FAZY D do usunięcia.
//
// Autoryzacja: VOICE_LLM_TOKEN, ten sam co /warmup. Bez niego endpoint byłby
// darmowym generatorem zapytań do płatnych API.
// Tylko odczyt: nie zapisuje niczego, nie dotyka rozmów.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// Klucz z env bywa z ogonem znaków niedrukowalnych — bez tego fetch rzuca TypeError
// na nagłówku. voice-agent-chat ma dokładnie ten sam zabieg.
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Sample = { ttft_ms: number | null; total_ms: number; ok: boolean; error?: string };

/** Czas do PIERWSZEGO tokenu tekstu — to jest liczba, która decyduje o odczuciu rozmówcy. */
const measureAnthropic = async (
  apiKey: string, model: string, system: string, user: string,
): Promise<Sample> => {
  const started = performance.now();
  let ttft: number | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 150, temperature: 0.5, stream: true,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return { ttft_ms: null, total_ms: Math.round(performance.now() - started), ok: false, error: `HTTP ${res.status}` };
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (ttft === null && chunk.includes("text_delta")) ttft = Math.round(performance.now() - started);
    }
    return { ttft_ms: ttft, total_ms: Math.round(performance.now() - started), ok: true };
  } catch (e) {
    return { ttft_ms: null, total_ms: Math.round(performance.now() - started), ok: false, error: (e as Error).name };
  }
};

const measureGemini = async (
  apiKey: string, model: string, system: string, user: string,
): Promise<Sample> => {
  const started = performance.now();
  let ttft: number | null = null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.5 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return { ttft_ms: null, total_ms: Math.round(performance.now() - started), ok: false, error: `HTTP ${res.status}` };
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (ttft === null && chunk.includes('"text"')) ttft = Math.round(performance.now() - started);
    }
    return { ttft_ms: ttft, total_ms: Math.round(performance.now() - started), ok: true };
  } catch (e) {
    return { ttft_ms: null, total_ms: Math.round(performance.now() - started), ok: false, error: (e as Error).name };
  }
};

const stats = (samples: Sample[]) => {
  const good = samples.filter((s) => s.ok && s.ttft_ms !== null).map((s) => s.ttft_ms as number).sort((a, b) => a - b);
  if (!good.length) return { probek: samples.length, udanych: 0, blad: samples.find((s) => !s.ok)?.error || "brak tokenów" };
  return {
    probek: samples.length,
    udanych: good.length,
    ttft_min: good[0],
    ttft_mediana: good[Math.floor(good.length / 2)],
    ttft_max: good[good.length - 1],
    ttft_srednia: Math.round(good.reduce((a, b) => a + b, 0) / good.length),
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const expected = await getPhase1Secret(admin, "VOICE_LLM_TOKEN");
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const system = String(body?.system || "Jesteś recepcjonistką warsztatu samochodowego.");
  const user = String(body?.user || "Chciałbym się umówić na wymianę oleju w piątek.");
  const runs = Math.min(Number(body?.runs) || 5, 10);

  // Klucze biorę stamtąd, gdzie już są. Anthropic z env (env-first), Gemini
  // z ai_providers — tak samo jak reszta systemu.
  const anthropicRaw = await getPhase1Secret(admin, "ANTHROPIC_API_KEY");
  const anthropicKey = anthropicRaw ? cleanKey(anthropicRaw) : null;
  const { data: gem } = await admin.from("ai_providers")
    .select("api_key_encrypted").eq("display_name", "Google Gemini").maybeSingle();
  const geminiKey = gem?.api_key_encrypted ? cleanKey(gem.api_key_encrypted) : null;

  const targets: Array<{ nazwa: string; run: () => Promise<Sample> }> = [];
  if (anthropicKey) {
    targets.push({ nazwa: "claude-haiku-4-5", run: () => measureAnthropic(anthropicKey, "claude-haiku-4-5-20251001", system, user) });
  }
  if (geminiKey) {
    for (const m of ["gemini-2.5-flash", "gemini-3-flash-preview"]) {
      targets.push({ nazwa: m, run: () => measureGemini(geminiKey, m, system, user) });
    }
  }
  if (!targets.length) return json({ error: "brak kluczy: ANTHROPIC_API_KEY (env) ani Google Gemini (ai_providers)" }, 400);

  const wyniki: Record<string, unknown> = {};
  for (const target of targets) {
    const samples: Sample[] = [];
    // Sekwencyjnie, nie równolegle: równoległe uderzenia mierzyłyby przepustowość,
    // a nas interesuje opóźnienie pojedynczego żądania.
    for (let i = 0; i < runs; i++) samples.push(await target.run());
    wyniki[target.nazwa] = { ...stats(samples), surowe: samples.map((s) => s.ttft_ms) };
  }

  return json({
    region: Deno.env.get("SB_REGION") || "eu-central-1",
    prompt_znakow: system.length,
    prompt_tokenow_szac: Math.round(system.length / 3.5),
    runs,
    wyniki,
  });
});

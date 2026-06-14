// ============================================================================
// voice-preview — odsłuch próbki głosu ElevenLabs dla panelu konfiguracji
// agenta głosowego (tenant wybiera głos + szybkość + tekst).
//
// Klucz ElevenLabs czytany z ai_secret_store przez getSecret (panel kluczy) —
// nigdy nie dotyka frontu. Dostęp: dowolny zalogowany użytkownik (provider).
// verify_jwt=false + ręczna weryfikacja getUser.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Brak konfiguracji Supabase");

    // Zalogowany użytkownik (provider) — wystarczy do odsłuchu próbki.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const apiKey = await getSecret(admin, "ELEVENLABS_API_KEY");
    if (!apiKey) return json({ success: false, error: "Brak klucza ElevenLabs — ustaw go w panelu Centrum AI" }, 400);

    const body = await req.json().catch(() => ({}));
    const voiceId = String(body?.voice_id || "").trim();
    const text = String(body?.text || "Dzień dobry, tu asystent głosowy. W czym mogę pomóc?").slice(0, 300);
    const clamp = (n: any, lo: number, hi: number, def: number) => {
      const x = Number(n);
      return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
    };
    const speed = clamp(body?.speed, 0.7, 1.2, 1.0);
    const stability = clamp(body?.stability, 0, 1, 0.45);
    const similarity_boost = clamp(body?.similarity_boost, 0, 1, 0.75);
    const style = clamp(body?.style, 0, 1, 0.0);
    if (!voiceId) return json({ success: false, error: "Brak voice_id" }, 400);

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability, similarity_boost, style, speed, use_speaker_boost: true },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 401) return json({ success: false, error: "Klucz ElevenLabs nieprawidłowy (401)" }, 400);
      return json({ success: false, error: `ElevenLabs błąd ${res.status}: ${errText.slice(0, 200)}` }, 400);
    }

    // audio/mpeg -> base64 (data URL po stronie frontu)
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    const base64 = btoa(bin);
    return json({ success: true, audio: base64, mime: "audio/mpeg" });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

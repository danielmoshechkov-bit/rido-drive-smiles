// ============================================================================
// voice-add — dodaje głos z biblioteki ElevenLabs na konto (by był używalny
// w TTS/rozmowie). Zwraca voice_id konta. Idempotentne-ish: gdy głos już dodany,
// ElevenLabs zwraca błąd "already added" — wtedy oddajemy oryginalny voice_id.
//
// Klucz ELEVENLABS z secure store. Dostęp: zalogowany usługodawca.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Brak konfiguracji Supabase");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const apiKey = await getSecret(admin, "ELEVENLABS_API_KEY");
    if (!apiKey) return json({ success: false, error: "Brak klucza ElevenLabs" }, 400);

    const body = await req.json().catch(() => ({}));
    const publicOwnerId = String(body?.public_owner_id || "");
    const voiceId = String(body?.voice_id || "");
    const name = String(body?.name || "Głos").slice(0, 60);
    if (!publicOwnerId || !voiceId) return json({ success: false, error: "Brak public_owner_id lub voice_id" }, 400);

    const res = await fetch(`https://api.elevenlabs.io/v1/voices/add/${publicOwnerId}/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: name }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out?.voice_id) return json({ success: true, voice_id: out.voice_id });

    // Głos już na koncie? Spróbuj odnaleźć po nazwie/oryginalnym id.
    const detail = (out?.detail?.message || out?.detail || "").toString().toLowerCase();
    if (detail.includes("already")) {
      const listRes = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey } });
      if (listRes.ok) {
        const list = await listRes.json();
        const found = (list?.voices || []).find((v: any) => v.name === name || v.voice_id === voiceId);
        if (found?.voice_id) return json({ success: true, voice_id: found.voice_id, already: true });
      }
      return json({ success: true, voice_id: voiceId, already: true });
    }
    return json({ success: false, error: `ElevenLabs błąd ${res.status}: ${detail.slice(0, 160)}` }, 400);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

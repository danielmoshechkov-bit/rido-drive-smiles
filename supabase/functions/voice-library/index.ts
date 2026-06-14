// ============================================================================
// voice-library — szuka NATYWNYCH głosów w bibliotece ElevenLabs dla danego
// języka (np. natywny polski lektor). Zwraca kandydatów do dodania na konto.
//
// Klucz ELEVENLABS z secure store (getSecret). Dostęp: zalogowany usługodawca.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret } from "../_shared/aiSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// nasz kod -> kod języka ElevenLabs (ua -> uk)
const toEL = (c: string) => (c === "ua" ? "uk" : c);

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
    const lang = toEL(String(body?.language || "pl"));
    const gender = body?.gender && body.gender !== "all" ? `&gender=${encodeURIComponent(body.gender)}` : "";
    const pageSize = Math.min(40, Number(body?.page_size) || 24);

    const url = `https://api.elevenlabs.io/v1/shared-voices?language=${encodeURIComponent(lang)}&page_size=${pageSize}${gender}`;
    const res = await fetch(url, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) {
      if (res.status === 401) return json({ success: false, error: "Klucz ElevenLabs nieprawidłowy (401)" }, 400);
      return json({ success: false, error: `ElevenLabs błąd ${res.status}` }, 400);
    }
    const data = await res.json();
    const voices = (data?.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      public_owner_id: v.public_owner_id || v.public_user_id || null,
      name: v.name,
      gender: (v.gender || "").toLowerCase() || null,
      accent: v.accent || null,
      language: v.language || lang,
      age: v.age || null,
      use_case: v.use_case || v.descriptive || null,
      preview_url: v.preview_url || null,
    })).filter((v: any) => v.public_owner_id && v.voice_id);

    return json({ success: true, voices });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

// ============================================================================
// voice-list — pobiera listę głosów NA ŻYWO z API ElevenLabs (głosy konta:
// premade multilingual + dodane z biblioteki + sklonowane). Zwraca metadane
// (płeć, akcent, opis, próbka preview_url) do panelu wyboru głosu.
//
// Klucz ElevenLabs czytany z ai_secret_store przez getSecret — nigdy do frontu.
// Dostęp: dowolny zalogowany użytkownik (provider). verify_jwt=false + getUser.
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const apiKey = await getSecret(admin, "ELEVENLABS_API_KEY");
    if (!apiKey) return json({ success: false, error: "Brak klucza ElevenLabs — ustaw go w panelu Centrum AI" }, 400);

    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey } });
    if (!res.ok) {
      if (res.status === 401) return json({ success: false, error: "Klucz ElevenLabs nieprawidłowy (401)" }, 400);
      return json({ success: false, error: `ElevenLabs błąd ${res.status}` }, 400);
    }
    const data = await res.json();
    const voices = (data?.voices || []).map((v: any) => {
      const labels = v.labels || {};
      return {
        voice_id: v.voice_id,
        name: v.name,
        gender: (labels.gender || "").toLowerCase() || null,   // male | female | null
        accent: labels.accent || null,
        age: labels.age || null,
        language: labels.language || null,                       // bywa puste — premade są multilingual
        use_case: labels.use_case || labels.description || null,
        description: v.description || labels.description || null,
        preview_url: v.preview_url || null,                      // gotowa próbka mp3 do szybkiego odsłuchu
        category: v.category || null,                            // premade | cloned | generated | professional
      };
    });

    // Zbierz dostępne wartości filtrów (do UI)
    const accents = Array.from(new Set(voices.map((v: any) => v.accent).filter(Boolean))).sort();
    const genders = Array.from(new Set(voices.map((v: any) => v.gender).filter(Boolean)));

    return json({ success: true, voices, filters: { accents, genders } });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

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
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  return phaseABlockedResponse(req, "voice-list");

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

    // Nasze języki. ElevenLabs używa 'uk' dla ukraińskiego -> mapujemy na 'ua'.
    const OUR = ["pl", "en", "ua", "ru"];
    const MULTI_MODELS = ["eleven_multilingual_v2", "eleven_multilingual_v1", "eleven_turbo_v2_5", "eleven_flash_v2_5"];
    const normLang = (c: string) => {
      const x = (c || "").toLowerCase().split("-")[0];
      return x === "uk" ? "ua" : x;
    };

    const voices = (data?.voices || []).map((v: any) => {
      const labels = v.labels || {};
      const models: string[] = v.high_quality_base_model_ids || [];
      const multilingual = models.some((m) => MULTI_MODELS.includes(m)) || v.category === "premade";

      // verified_languages: dostępne w nowszym API (locale + akcent + próbka per język)
      const verifiedAll = (v.verified_languages || []).map((x: any) => ({
        lang: normLang(x.language || x.locale || ""),
        accent: x.accent || null,
        preview_url: x.preview_url || null,
      }));
      const verifiedOur = verifiedAll.filter((x: any) => OUR.includes(x.lang));
      const verifiedLangs = Array.from(new Set(verifiedOur.map((x: any) => x.lang)));

      // Język natywny głosu (z etykiety language lub akcentu)
      const lblLang = normLang(labels.language || "");
      const accentLc = (labels.accent || "").toLowerCase();
      const accentLang = accentLc.includes("pol") ? "pl"
        : accentLc.includes("ukrain") ? "ua"
        : accentLc.includes("russ") ? "ru"
        : (accentLc.includes("english") || accentLc.includes("british") || accentLc.includes("american") || accentLc.includes("australian")) ? "en"
        : "";
      const nativeLangs = Array.from(new Set([
        OUR.includes(lblLang) ? lblLang : "",
        OUR.includes(accentLang) ? accentLang : "",
      ].filter(Boolean)));

      const recommended = verifiedLangs.length > 0 || multilingual;
      // natywny dla naszych języków = najwyżej; potem zweryfikowane; multilingual = bonus
      const score = nativeLangs.length * 4 + verifiedLangs.length * 2 + (multilingual ? 1 : 0);

      return {
        voice_id: v.voice_id,
        name: v.name,
        gender: (labels.gender || "").toLowerCase() || null,   // male | female | null
        accent: labels.accent || null,
        age: labels.age || null,
        use_case: labels.use_case || labels.description || null,
        description: v.description || labels.description || null,
        preview_url: v.preview_url || null,                      // domyślna próbka (zwykle EN)
        category: v.category || null,
        multilingual,                                            // czy obsługuje model wielojęzyczny
        native_langs: nativeLangs,                               // nasze języki, dla których głos jest NATYWNY
        verified_langs: verifiedLangs,                           // nasze języki potwierdzone przez ElevenLabs
        verified_previews: verifiedOur,                          // [{lang, accent, preview_url}] dla naszych języków
        recommended,
        score,
      };
    });

    // Sort: zalecane / najlepsze wielojęzyczne na górę
    voices.sort((a: any, b: any) => b.score - a.score || a.name.localeCompare(b.name));

    const accents = Array.from(new Set(voices.map((v: any) => v.accent).filter(Boolean))).sort();
    const genders = Array.from(new Set(voices.map((v: any) => v.gender).filter(Boolean)));

    return json({ success: true, voices, filters: { accents, genders } });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

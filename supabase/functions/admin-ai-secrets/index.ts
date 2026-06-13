// ============================================================================
// admin-ai-secrets — zarządzanie kluczami API z panelu admina (Centrum AI).
// Metoda A2: wartości w ai_secret_store (admin-only), czytane przez service_role.
//
// Akcje (wszystkie WYŁĄCZNIE dla zalogowanego admina — weryfikacja JWT tutaj):
//   - status : lista {key, is_set, source, is_encrypted, updated_at}  (BEZ wartości)
//   - set    : {key, value} -> zapis (nadpisuje stary, jak zmiana hasła)
//   - test   : {key} -> REALNE zapytanie do providera tym kluczem -> {ok, message}
//
// verify_jwt=false w config.toml — autoryzację robimy ręcznie (has_role admin).
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSecret, setSecret, secretStatus, encryptionAvailable } from "../_shared/aiSecrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Allowlista kluczy zarządzalnych z panelu (rozszerzalna — "jeden panel na wszystko").
// test: jak realnie zweryfikować klucz u dostawcy.
const ALLOWED: Record<string, { group: string; test: "elevenlabs" | "twilio" | "twilio_number" | "deepgram" | null }> = {
  ELEVENLABS_API_KEY: { group: "voice", test: "elevenlabs" },
  TWILIO_ACCOUNT_SID: { group: "voice", test: "twilio" },
  TWILIO_AUTH_TOKEN: { group: "voice", test: "twilio" },
  TWILIO_PHONE_NUMBER: { group: "voice", test: "twilio_number" },
  DEEPGRAM_API_KEY: { group: "voice", test: "deepgram" },
};

async function testConnection(sb: any, kind: string): Promise<{ ok: boolean; message: string }> {
  try {
    if (kind === "elevenlabs") {
      const key = await getSecret(sb, "ELEVENLABS_API_KEY");
      if (!key) return { ok: false, message: "Brak klucza ElevenLabs" };
      const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
      if (res.ok) return { ok: true, message: "✓ ElevenLabs: połączenie działa" };
      if (res.status === 401) return { ok: false, message: "✗ ElevenLabs: klucz nieprawidłowy (401)" };
      return { ok: false, message: `✗ ElevenLabs: błąd ${res.status}` };
    }

    if (kind === "twilio") {
      const sid = await getSecret(sb, "TWILIO_ACCOUNT_SID");
      const token = await getSecret(sb, "TWILIO_AUTH_TOKEN");
      if (!sid || !token) return { ok: false, message: "Brak Twilio SID lub Auth Token" };
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
      });
      if (res.ok) return { ok: true, message: "✓ Twilio: SID + token działają" };
      if (res.status === 401) return { ok: false, message: "✗ Twilio: SID lub token nieprawidłowy (401)" };
      return { ok: false, message: `✗ Twilio: błąd ${res.status}` };
    }

    if (kind === "twilio_number") {
      const sid = await getSecret(sb, "TWILIO_ACCOUNT_SID");
      const token = await getSecret(sb, "TWILIO_AUTH_TOKEN");
      const number = await getSecret(sb, "TWILIO_PHONE_NUMBER");
      if (!sid || !token) return { ok: false, message: "Najpierw ustaw Twilio SID + Auth Token" };
      if (!number) return { ok: false, message: "Brak numeru Twilio" };
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`;
      const res = await fetch(url, { headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) } });
      if (res.status === 401) return { ok: false, message: "✗ Twilio: SID lub token nieprawidłowy (401)" };
      if (!res.ok) return { ok: false, message: `✗ Twilio: błąd ${res.status}` };
      const data = await res.json().catch(() => ({}));
      const found = Array.isArray(data?.incoming_phone_numbers) && data.incoming_phone_numbers.length > 0;
      return found
        ? { ok: true, message: "✓ Twilio: numer należy do konta" }
        : { ok: false, message: "✗ Twilio: numer nie znaleziony na koncie (sprawdź format +48…)" };
    }

    if (kind === "deepgram") {
      const key = await getSecret(sb, "DEEPGRAM_API_KEY");
      if (!key) return { ok: false, message: "Brak klucza Deepgram" };
      const res = await fetch("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${key}` } });
      if (res.ok) return { ok: true, message: "✓ Deepgram: połączenie działa" };
      if (res.status === 401) return { ok: false, message: "✗ Deepgram: klucz nieprawidłowy (401)" };
      return { ok: false, message: `✗ Deepgram: błąd ${res.status}` };
    }

    return { ok: false, message: "Nieznany typ testu" };
  } catch (e) {
    return { ok: false, message: `✗ Błąd połączenia: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("Brak konfiguracji Supabase w Edge Function");

    // --- Weryfikacja: zalogowany ADMIN (JWT) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ success: false, error: "Brak autoryzacji" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminRole, error: roleError } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!adminRole) return json({ success: false, error: "Brak uprawnień administratora" }, 403);

    // --- Akcje ---
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "status";

    if (action === "status") {
      const keys = Object.keys(ALLOWED);
      const statuses = await Promise.all(keys.map((k) => secretStatus(admin, k)));
      return json({ success: true, encryption: encryptionAvailable(), statuses });
    }

    if (action === "set") {
      const key = String(body?.key || "");
      const value = String(body?.value ?? "");
      if (!ALLOWED[key]) return json({ success: false, error: "Niedozwolony klucz" }, 400);
      if (!value.trim()) return json({ success: false, error: "Pusta wartość klucza" }, 400);
      await setSecret(admin, key, value.trim(), ALLOWED[key].group, user.id);
      return json({ success: true, encrypted: encryptionAvailable() });
    }

    if (action === "test") {
      const key = String(body?.key || "");
      const def = ALLOWED[key];
      if (!def) return json({ success: false, error: "Niedozwolony klucz" }, 400);
      if (!def.test) return json({ success: false, error: "Brak testu dla tego klucza" }, 400);
      const result = await testConnection(admin, def.test);
      return json({ success: true, ...result });
    }

    return json({ success: false, error: "Nieznana akcja" }, 400);
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

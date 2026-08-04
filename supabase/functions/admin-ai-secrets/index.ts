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
import { getSecret, setSecret, secretStatus, encryptionAvailable } from "../_shared/aiSecrets.ts";
import { consumeAiRateLimit } from "../_shared/aiSecurity.ts";
import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";

const ADMIN_SECRET_MAX_BODY_BYTES = 32_768;
const ADMIN_SECRET_TEST_HOURLY_LIMIT = 10;
const ADMIN_SECRET_TEST_DAILY_LIMIT = 30;
const ADMIN_SECRET_PROVIDER_TIMEOUT_MS = 15_000;

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
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": key },
        signal: AbortSignal.timeout(ADMIN_SECRET_PROVIDER_TIMEOUT_MS),
      });
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
        signal: AbortSignal.timeout(ADMIN_SECRET_PROVIDER_TIMEOUT_MS),
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
      const res = await fetch(url, {
        headers: { Authorization: "Basic " + btoa(`${sid}:${token}`) },
        signal: AbortSignal.timeout(ADMIN_SECRET_PROVIDER_TIMEOUT_MS),
      });
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
      const res = await fetch("https://api.deepgram.com/v1/projects", {
        headers: { Authorization: `Token ${key}` },
        signal: AbortSignal.timeout(ADMIN_SECRET_PROVIDER_TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, message: "✓ Deepgram: połączenie działa" };
      if (res.status === 401) return { ok: false, message: "✗ Deepgram: klucz nieprawidłowy (401)" };
      return { ok: false, message: `✗ Deepgram: błąd ${res.status}` };
    }

    return { ok: false, message: "Nieznany typ testu" };
  } catch (e) {
    console.error("admin_ai_secret_provider_test_failed", e instanceof Error ? e.name : "unknown_error");
    return { ok: false, message: "✗ Nie udało się zweryfikować połączenia" };
  }
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Dozwolona jest wyłącznie metoda POST");
    }

    const admin = createServiceClient();
    const identity = await requireAdmin(req, admin);

    // --- Akcje ---
    const body = await readJsonBody(req, ADMIN_SECRET_MAX_BODY_BYTES);
    const action = body?.action || "status";

    if (action === "status") {
      const keys = Object.keys(ALLOWED);
      const statuses = await Promise.all(keys.map((k) => secretStatus(admin, k)));
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        action: "ai_secret.status",
        resourceType: "ai_secret",
        result: "succeeded",
        correlationId: identity.correlationId,
      });
      return jsonResponse(req, 200, { success: true, encryption: encryptionAvailable(), statuses });
    }

    if (action === "set") {
      const key = String(body?.key || "");
      const value = String(body?.value ?? "");
      if (!ALLOWED[key]) throw new SecurityError(400, "secret_not_allowed", "Niedozwolony klucz");
      if (!value.trim() || value.length > 16_384) {
        throw new SecurityError(400, "invalid_secret", "Nieprawidłowa wartość sekretu");
      }
      if (!encryptionAvailable()) {
        throw new SecurityError(503, "secret_encryption_unavailable", "Zapis sekretów wymaga skonfigurowanego szyfrowania");
      }
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        action: "ai_secret.set",
        resourceType: "ai_secret",
        resourceId: key,
        result: "attempted",
        correlationId: identity.correlationId,
      });
      await setSecret(admin, key, value.trim(), ALLOWED[key].group, identity.userId);
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        action: "ai_secret.set",
        resourceType: "ai_secret",
        resourceId: key,
        result: "succeeded",
        correlationId: identity.correlationId,
      });
      return jsonResponse(req, 200, { success: true, encrypted: true });
    }

    if (action === "test") {
      const key = String(body?.key || "");
      const def = ALLOWED[key];
      if (!def) throw new SecurityError(400, "secret_not_allowed", "Niedozwolony klucz");
      if (!def.test) throw new SecurityError(400, "secret_test_unavailable", "Brak testu dla tego klucza");
      await consumeAiRateLimit(admin, {
        scope: "ai.admin_secret.test.user.hourly",
        subjectId: identity.userId,
        limit: ADMIN_SECRET_TEST_HOURLY_LIMIT,
        windowSeconds: 3_600,
      });
      await consumeAiRateLimit(admin, {
        scope: "ai.admin_secret.test.user.daily",
        subjectId: identity.userId,
        limit: ADMIN_SECRET_TEST_DAILY_LIMIT,
        windowSeconds: 86_400,
      });
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        action: "ai_secret.test",
        resourceType: "ai_secret",
        resourceId: key,
        result: "attempted",
        correlationId: identity.correlationId,
      });
      const result = await testConnection(admin, def.test);
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        action: "ai_secret.test",
        resourceType: "ai_secret",
        resourceId: key,
        result: result.ok ? "succeeded" : "failed",
        correlationId: identity.correlationId,
        metadata: { provider_connection_ok: result.ok },
      });
      return jsonResponse(req, 200, { success: true, ...result });
    }

    throw new SecurityError(400, "unknown_action", "Nieznana akcja");
  } catch (e) {
    return errorResponse(req, e);
  }
});

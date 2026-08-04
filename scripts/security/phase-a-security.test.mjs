import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  constantTimeEqual,
  isOriginAllowed,
  isUuid,
  parseAllowedOrigins,
  readBearerToken,
  redactAuditMetadata,
  safeCorrelationId,
} from "../../supabase/functions/_shared/securityPrimitives.ts";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

test("parser Bearer odrzuca brak i niejednoznaczne nagłówki", () => {
  assert.equal(readBearerToken(null), null);
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken("Bearer"), null);
  assert.equal(readBearerToken("Bearer token extra"), null);
  assert.equal(readBearerToken("Bearer valid-token"), "valid-token");
});

test("porównanie sekretów uwzględnia treść i długość", () => {
  assert.equal(constantTimeEqual("a".repeat(32), "a".repeat(32)), true);
  assert.equal(constantTimeEqual("a".repeat(32), "b".repeat(32)), false);
  assert.equal(constantTimeEqual("a".repeat(32), "a".repeat(31)), false);
});

test("allowlista originów nigdy nie rozszerza się przez wildcard lub błędny URL", () => {
  const origins = parseAllowedOrigins("https://app.getrido.pl,*,not-a-url", "https://admin.getrido.pl/path");
  assert.deepEqual([...origins].sort(), ["https://admin.getrido.pl", "https://app.getrido.pl"]);
  assert.equal(isOriginAllowed("https://app.getrido.pl", origins), true);
  assert.equal(isOriginAllowed("https://evil.example", origins), false);
  assert.equal(isOriginAllowed(null, origins), true);
});

test("correlation ID i identyfikatory tenantów wymagają UUID", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(isUuid(uuid), true);
  assert.equal(safeCorrelationId(uuid), uuid);
  assert.equal(safeCorrelationId("attacker-controlled"), null);
  assert.equal(isUuid("../tenant-b"), false);
});

test("metadata audytu usuwa sekrety i ogranicza rozmiar", () => {
  const redacted = redactAuditMetadata({
    authorization: "Bearer secret",
    password: "secret",
    nested: { api_key: "secret", safe: "x".repeat(700) },
  });
  assert.deepEqual(redacted.authorization, "[REDACTED]");
  assert.deepEqual(redacted.password, "[REDACTED]");
  assert.deepEqual(redacted.nested.api_key, "[REDACTED]");
  assert.ok(redacted.nested.safe.length < 700);
});

test("każda implementacja Edge Function ma jedną jawną sekcję config", () => {
  const config = read("supabase/config.toml");
  const configured = [...config.matchAll(/^\[functions\.([^\]]+)\]$/gm)].map((match) => match[1]);
  const counts = new Map();
  for (const name of configured) counts.set(name, (counts.get(name) ?? 0) + 1);

  const implemented = readdirSync(join(ROOT, "supabase/functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .filter((entry) => {
      try {
        return readFileSync(join(ROOT, "supabase/functions", entry.name, "index.ts"), "utf8").length > 0;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name)
    .sort();

  for (const name of implemented) assert.equal(counts.get(name), 1, `Brak jednoznacznej sekcji config: ${name}`);
  for (const [name, count] of counts) assert.equal(count, 1, `Zduplikowana sekcja config: ${name}`);
  const configOnly = [...counts.keys()].filter((name) => !implemented.includes(name)).sort();
  assert.deepEqual(configOnly, ["ai-admin-assistant", "ai-chat-support"]);
});

test("wyjątki bez JWT są jawne i ograniczone", () => {
  const config = read("supabase/config.toml");
  const sections = [...config.matchAll(/^\[functions\.([^\]]+)\]\nverify_jwt = (true|false)$/gm)]
    .map((match) => ({ name: match[1], verifyJwt: match[2] === "true" }));
  const withoutJwt = sections.filter((section) => !section.verifyJwt).map((section) => section.name).sort();
  assert.deepEqual(withoutJwt, ["admin-bootstrap", "voice-agent-llm", "voice-call-postprocess"]);
});

test("każdy niezatwierdzony Edge endpoint jest jawnie fail-closed", () => {
  const reviewedUnguarded = [
    "admin-ai-agent",
    "admin-ai-secrets",
    "admin-bootstrap",
    "admin-create-user",
    "admin-list-users",
    "admin-users",
    "ai-assistant",
    "ai-chat",
    "ai-generate-call-scripts",
    "cleanup-fake-auth-accounts",
    "create-driver-accounts",
    "create-fleet-account",
    "create-test-accounts",
    "csv-import",
    "deepgram-transcribe",
    "getrido-ai-execute",
    "import-drivers",
    "ksef-integration",
    "payment-core",
    "private-storage-download",
    "rebuild-drivers",
    "register-driver",
    "register-fleet",
    "register-marketplace-user",
    "reminders",
    "rental-dispatcher",
    "resend-activation-email",
    "reset-driver-password",
    "rido-mail",
    "sanitize-getrido",
    "send-fleet-registration-email",
    "send-password-reset-email",
    "send-registration-email",
    "settlements",
    "update-driver-debt",
    "voice-agent-chat",
    "voice-agent-llm",
    "voice-agent-simulate",
    "voice-agent-tools",
    "voice-call-analyze",
    "voice-call-postprocess",
  ].sort();

  const implemented = readdirSync(join(ROOT, "supabase/functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .filter((entry) => {
      try {
        return readFileSync(join(ROOT, "supabase/functions", entry.name, "index.ts"), "utf8").length > 0;
      } catch {
        return false;
      }
    });
  const guarded = [];
  const unguarded = [];
  for (const entry of implemented) {
    const source = read(`supabase/functions/${entry.name}/index.ts`);
    if (source.includes("phaseABlockedResponse")) {
      guarded.push(entry.name);
      const handlerStartPattern =
        /(?:(?:Deno\.)?serve\s*\(\s*async\s*\([^)]*\)\s*(?::\s*Promise<Response>)?\s*=>|const\s+handler\s*=\s*async\s*\([^)]*\)\s*(?::\s*Promise<Response>)?\s*=>)\s*\{/g;
      const guard = new RegExp(
        `return\\s+phaseABlockedResponse\\(req,\\s*["']${entry.name}["']\\s*\\)`,
      ).exec(source);
      assert.ok(guard, `${entry.name}: brak właściwego guardu`);

      const handler = [...source.matchAll(handlerStartPattern)]
        .filter((match) => match.index < guard.index)
        .at(-1);
      assert.ok(handler, `${entry.name}: nie znaleziono handlera`);

      const beforeGuard = source.slice(handler.index + handler[0].length, guard.index);
      assert.equal(
        beforeGuard.trim(),
        "",
        `${entry.name}: guard musi być pierwszą instrukcją handlera, przed I/O i skutkami ubocznymi`,
      );
    } else {
      unguarded.push(entry.name);
    }
  }

  assert.equal(guarded.length, 131, "Zmiana liczby blokad wymaga jawnego review klasy endpointu");
  assert.deepEqual(unguarded.sort(), reviewedUnguarded);
  const helper = read("supabase/functions/_shared/phaseABlock.ts");
  assert.match(helper, /jsonResponse\(req, 503/);
  assert.match(helper, /security_configuration_required/);
});

test("krytyczne endpointy administracyjne korzystają ze wspólnego auth i bezpiecznego CORS", () => {
  const adminOnly = [
    "admin-ai-secrets",
    "admin-create-user",
    "admin-list-users",
    "cleanup-fake-auth-accounts",
    "csv-import",
    "import-drivers",
    "rebuild-drivers",
    "sanitize-getrido",
  ];
  for (const name of adminOnly) {
    const source = read(`supabase/functions/${name}/index.ts`);
    assert.match(source, /requireAdmin\s*\(/, `${name} nie wymaga roli admin z DB`);
    assert.match(source, /handleCors\s*\(/, `${name} nie używa origin allowlist`);
    assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
  }

  const bootstrap = read("supabase/functions/admin-bootstrap/index.ts");
  assert.match(bootstrap, /ADMIN_BOOTSTRAP_ENABLED/);
  assert.match(bootstrap, /ADMIN_BOOTSTRAP_SECRET/);
  assert.doesNotMatch(bootstrap, /rido-setup-2025/);
});

test("legacy konta testowe i masowy import nie zawierają stałych haseł", () => {
  const names = [
    "admin-bootstrap",
    "create-driver-accounts",
    "create-test-accounts",
    "csv-import",
    "rebuild-drivers",
    "reset-driver-password",
  ];
  for (const name of names) {
    const source = read(`supabase/functions/${name}/index.ts`);
    assert.doesNotMatch(source, /Test123(?:45)?!/);
    assert.doesNotMatch(source, /Math\.random/);
  }
  for (const name of names.filter((name) => name !== "create-test-accounts")) {
    assert.doesNotMatch(read(`supabase/functions/${name}/index.ts`), /email_confirm\s*:\s*true/);
  }
  const localTestSetup = read("supabase/functions/create-test-accounts/index.ts");
  assert.match(localTestSetup, /ENVIRONMENT.*local/);
  assert.match(localTestSetup, /LOCAL_TEST_SETUP_SECRET/);
  assert.match(localTestSetup, /local_runtime_required/);
  assert.match(read("supabase/functions/create-driver-accounts/index.ts"), /bulk_account_creation_disabled/);
  assert.match(read("supabase/functions/csv-import/index.ts"), /force_first_import_disabled/);
});

test("magazyn sekretów nie zapisuje ani nie odczytuje plaintext", () => {
  const source = read("supabase/functions/_shared/aiSecrets.ts");
  assert.match(source, /Refusing to read a plaintext secret/);
  assert.match(source, /AI_SECRETS_ENC_KEY missing or too short/);
  assert.doesNotMatch(source, /ciphertext:\s*plain,\s*is_encrypted:\s*false/);
});

test("migracja odbiera PUBLIC uprzywilejowane RPC i tworzy append-only audit", () => {
  const migration = read("supabase/migrations/20260801110000_phase_a_security_foundation.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.security_audit_log/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.merge_duplicate_drivers\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.credit_welcome_bonus\(uuid, numeric\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_find_user_by_email/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.link_auth_user_to_driver/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.security_bootstrap_claims/);
  assert.match(migration, /ai_secret_store_encrypted_only/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.security_webhook_events/);
  assert.doesNotMatch(migration, /actor_id uuid REFERENCES auth\.users/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.user_roles FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.company_members FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.driver_app_users FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /v_target_email_confirmed_at IS NULL/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.referral_uses FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.referral_codes FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.credit_welcome_bonus\(uuid, numeric\) FROM service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_referral_on_first_purchase\(uuid, numeric, uuid\) FROM service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_domain_events\(integer\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 100\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.deduct_vehicle_lookup_credit\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.deduct_sms_credit\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.increment_driver_debt\(uuid, numeric\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.workshop_order_sequences FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /workshop_order_number_is_immutable/);
  assert.doesNotMatch(migration, /generate_series\(1, v_max \+ 1\)/);
  assert.match(migration, /invoice-number:/);
  assert.match(migration, /auth\.uid\(\) IS DISTINCT FROM p_user_id/);
});

test("tabele poświadczeń są wyłącznie serwerowe i bez nadmiarowych grantów", () => {
  const migration = read("supabase/migrations/20260801112000_phase_a_credential_table_lockdown.sql");
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM service_role/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.%I TO service_role/);
  assert.doesNotMatch(migration, /GRANT ALL PRIVILEGES ON TABLE/);
});

test("webhook ElevenLabs wiąże tenant z podpisanym agentem i atomowo blokuje replay", () => {
  const source = read("supabase/functions/voice-call-postprocess/index.ts");
  assert.doesNotMatch(source, /searchParams\.get\(["']provider_id/);
  assert.doesNotMatch(source, /searchParams\.get\(["']persona_key/);
  assert.match(source, /eq\("elevenlabs_agent_id", agentId\)/);
  const claim = source.indexOf('from("security_webhook_events").insert');
  const effect = source.indexOf('/functions/v1/voice-call-analyze');
  assert.ok(claim >= 0 && effect > claim, "claim webhooka musi poprzedzać skutek");
  assert.match(source, /claimError\?\.code === "23505"/);
  assert.match(source, /status: "failed"/);
});

test("agent głosowy wymusza dry-run użytkownika i blokuje narzędzia write", () => {
  const chat = read("supabase/functions/voice-agent-chat/index.ts");
  assert.match(chat, /const testMode = resolveAiDryRun\(\{/);
  assert.match(chat, /callerKind: identity \? "user_jwt" : "internal_capability"/);
  assert.match(chat, /requestedDryRun: identity \? true : false/);
  assert.match(chat, /const dryRunTools = testMode \|\| cfg\.dry_run_tools !== false/);
  assert.match(chat, /if \(name !== "check_availability"\) return \{ ok: false, error: "write_tools_disabled" \}/);

  const toolsSource = read("supabase/functions/voice-agent-tools/index.ts");
  const writeGate = toolsSource.indexOf('error: "voice_write_tools_disabled"');
  const firstWrite = toolsSource.indexOf('.from("service_bookings").insert');
  assert.ok(writeGate >= 0 && firstWrite > writeGate, "bramka write musi wystąpić przed insertem");
});

test("custom LLM nie przyjmuje sekretu w URL i wiąże krótkie capability z pełnym kontekstem", () => {
  const source = read("supabase/functions/voice-agent-llm/index.ts");
  assert.match(source, /url\.searchParams\.has\("token"\)/);
  assert.match(source, /verifyAiCapabilityToken\(readCapabilityBearer\(req\), signingSecret/);
  assert.match(source, /providerId,[\s\S]*?configId: config\.id,[\s\S]*?callId,[\s\S]*?personaKey,[\s\S]*?scope: "voice\.llm"/);
  assert.match(source, /requireAiLiveRuntimeEnabled/);
  assert.doesNotMatch(source, /deriveTenantToken|expectedToken|searchParams\.get\("token"\)/);
});

test("Rido Mail szyfruje nowe hasła i nigdy nie zwraca kolumny poświadczeń", () => {
  const source = read("supabase/functions/rido-mail/index.ts");
  assert.match(source, /EMAIL_CREDENTIALS_ENC_KEY/);
  assert.match(source, /AES-GCM/);
  assert.match(source, /encrypted_password: encryptedPassword/);
  assert.doesNotMatch(source, /encrypted_password:\s*password/);
  assert.doesNotMatch(source, /from\(["']email_accounts["']\)\s*\.select\(["']\*["']\)/);
});

test("reset kierowcy nie może zmienić hasła ani usunąć całego konta Auth", () => {
  const source = read("supabase/functions/reset-driver-password/index.ts");
  assert.match(source, /verified_recovery_required/);
  assert.match(source, /verified_unlink_required/);
  assert.doesNotMatch(source, /auth\.admin\.updateUserById/);
  assert.doesNotMatch(source, /auth\.admin\.deleteUser/);
});

test("krytyczne operacje konta wymagające reautoryzacji pozostają zablokowane", () => {
  const source = read("supabase/functions/admin-users/index.ts");
  const deleteGate = source.indexOf("verified_account_deletion_required");
  const deleteEffect = source.indexOf("auth.admin.deleteUser");
  const confirmationGate = source.indexOf("verified_email_confirmation_required");
  const confirmationEffect = source.indexOf("auth.admin.updateUserById");
  assert.ok(deleteGate >= 0 && deleteEffect > deleteGate);
  assert.ok(confirmationGate >= 0 && confirmationEffect > confirmationGate);
});

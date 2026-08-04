import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  AI_RISK_CLASSES,
  aiRiskRequiresIdempotency,
  consumeAiRateLimit,
  issueAiCapabilityToken,
  normalizeAiRiskClass,
  requireAiLiveRuntimeEnabled,
  requireAiIdempotencyKey,
  requireAiRequestIdempotencyKey,
  resolveAiDryRun,
  verifyAiCapabilityToken,
} from "../../supabase/functions/_shared/aiSecurity.ts";
import { SecurityError } from "../../supabase/functions/_shared/securityPrimitives.ts";

const ROOT = process.cwd();
const SECRET = "phase-e-test-signing-key-that-is-at-least-32-bytes";
const TENANT_A_PROVIDER = "11111111-1111-4111-8111-111111111111";
const TENANT_B_PROVIDER = "22222222-2222-4222-8222-222222222222";
const CONFIG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CALL_A = "conversation-A_123";
const PERSONA = "workshop_secretary";
const SCOPE = "voice:tools:execute";
const IDEMPOTENCY = "550e8400-e29b-41d4-a716-446655440000";
const NOW = 1_800_000_000;

const bindingA = {
  providerId: TENANT_A_PROVIDER,
  configId: CONFIG_A,
  callId: CALL_A,
  personaKey: PERSONA,
  scope: SCOPE,
};

function expectSecurityError(run, code, status) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof SecurityError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

async function expectSecurityRejection(run, code, status) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof SecurityError);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

async function tokenForA(overrides = {}) {
  return issueAiCapabilityToken(SECRET, {
    ...bindingA,
    nonce: "550e8400-e29b-41d4-a716-446655440001",
    nowSeconds: NOW,
    ttlSeconds: 120,
    ...overrides,
  });
}

test("klasy ryzyka są zamkniętą allowlistą, a każdy zapis wymaga idempotencji", () => {
  assert.deepEqual(AI_RISK_CLASSES, [
    "read_only",
    "write_low",
    "write_high",
    "financial",
    "legal",
    "destructive",
  ]);
  assert.equal(normalizeAiRiskClass("write_high"), "write_high");
  expectSecurityError(() => normalizeAiRiskClass("admin"), "invalid_ai_risk_class", 400);

  assert.equal(aiRiskRequiresIdempotency("read_only"), false);
  for (const risk of AI_RISK_CLASSES.filter((value) => value !== "read_only")) {
    assert.equal(aiRiskRequiresIdempotency(risk), true);
    expectSecurityError(() => requireAiIdempotencyKey(null, risk), "missing_ai_idempotency_key", 400);
    assert.equal(requireAiIdempotencyKey(IDEMPOTENCY.toUpperCase(), risk), IDEMPOTENCY);
  }
  assert.equal(requireAiIdempotencyKey(null, "read_only"), null);
  expectSecurityError(() => requireAiIdempotencyKey("same-operation", "write_low"), "invalid_ai_idempotency_key", 400);
});

test("produkcja AI ma osobną bramkę wdrożeniową fail-closed", () => {
  assert.doesNotThrow(() => requireAiLiveRuntimeEnabled("true"));
  for (const value of [undefined, null, false, true, "false", "TRUE", "1", " true "]) {
    expectSecurityError(
      () => requireAiLiveRuntimeEnabled(value),
      "ai_live_runtime_disabled",
      503,
    );
  }
});

test("klucz idempotencji write jest pobierany wyłącznie z nagłówka", () => {
  const request = new Request("https://app.getrido.pl/functions/v1/voice-agent-tools", {
    method: "POST",
    headers: { "x-idempotency-key": IDEMPOTENCY },
  });
  assert.equal(requireAiRequestIdempotencyKey(request, "write_low"), IDEMPOTENCY);
  expectSecurityError(
    () => requireAiRequestIdempotencyKey(new Request(request.url), "write_low"),
    "missing_ai_idempotency_key",
    400,
  );
});

test("JWT użytkownika zawsze wymusza dry-run niezależnie od body", async () => {
  const token = await tokenForA();
  const capability = await verifyAiCapabilityToken(token, SECRET, {
    binding: bindingA,
    nowSeconds: NOW + 1,
  });
  assert.equal(resolveAiDryRun({
    callerKind: "user_jwt",
    requestedDryRun: false,
    verifiedCapability: capability,
    requiredProductionScope: SCOPE,
  }), true);
  assert.equal(resolveAiDryRun({ callerKind: "user_jwt", requestedDryRun: true }), true);
  assert.equal(resolveAiDryRun({
    callerKind: "internal_capability",
    requestedDryRun: false,
    requiredProductionScope: SCOPE,
  }), true);
  assert.equal(resolveAiDryRun({
    callerKind: "internal_capability",
    requestedDryRun: false,
    verifiedCapability: capability,
    requiredProductionScope: SCOPE,
  }), false);
  assert.equal(resolveAiDryRun({
    callerKind: "internal_capability",
    requestedDryRun: false,
    verifiedCapability: capability,
    requiredProductionScope: "voice:tools:read",
  }), true);
  assert.equal(resolveAiDryRun({
    callerKind: "internal_capability",
    verifiedCapability: capability,
    requiredProductionScope: SCOPE,
  }), true);
  expectSecurityError(
    () => resolveAiDryRun({ callerKind: "user_jwt", requestedDryRun: "false" }),
    "invalid_ai_dry_run",
    400,
  );
});

test("capability jest krótko ważne i związane ze wszystkimi polami operacji", async () => {
  const token = await tokenForA();
  const claims = await verifyAiCapabilityToken(token, SECRET, {
    binding: bindingA,
    nowSeconds: NOW + 60,
  });
  assert.equal(claims.provider_id, TENANT_A_PROVIDER);
  assert.equal(claims.config_id, CONFIG_A);
  assert.equal(claims.call_id, CALL_A);
  assert.equal(claims.persona_key, PERSONA);
  assert.equal(claims.scope, SCOPE);
  assert.equal(claims.exp - claims.iat, 120);
  assert.equal(claims.nonce, "550e8400-e29b-41d4-a716-446655440001");
  assert.equal(Object.isFrozen(claims), true);
});

test("capability Tenant A nie może zostać użyte jako Tenant B", async () => {
  const token = await tokenForA();
  await expectSecurityRejection(
    () => verifyAiCapabilityToken(token, SECRET, {
      binding: { ...bindingA, providerId: TENANT_B_PROVIDER },
      nowSeconds: NOW + 1,
    }),
    "ai_capability_binding_denied",
    403,
  );
});

test("capability odrzuca zły scope, config, call i personę", async () => {
  const token = await tokenForA();
  const mismatches = [
    { scope: "voice:tools:read" },
    { configId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { callId: "conversation-B_456" },
    { personaKey: "sales_agent" },
  ];
  for (const mismatch of mismatches) {
    await expectSecurityRejection(
      () => verifyAiCapabilityToken(token, SECRET, {
        binding: { ...bindingA, ...mismatch },
        nowSeconds: NOW + 1,
      }),
      "ai_capability_binding_denied",
      403,
    );
  }
});

test("wygasłe, przyszłe i zbyt długie capability są odrzucane", async () => {
  const token = await tokenForA();
  await expectSecurityRejection(
    () => verifyAiCapabilityToken(token, SECRET, { binding: bindingA, nowSeconds: NOW + 120 }),
    "expired_ai_capability",
    401,
  );

  const future = await tokenForA({ nowSeconds: NOW + 120 });
  await expectSecurityRejection(
    () => verifyAiCapabilityToken(future, SECRET, { binding: bindingA, nowSeconds: NOW }),
    "invalid_ai_capability_time",
    401,
  );

  await expectSecurityRejection(
    () => tokenForA({ ttlSeconds: 301 }),
    "invalid_ai_capability_ttl",
    400,
  );
});

test("modyfikacja payloadu, podpisu lub użycie innego klucza unieważnia capability", async () => {
  const token = await tokenForA();
  const [prefix, payload, signature] = token.split(".");
  const tamperedPayload = `${prefix}.${payload.slice(0, -1)}${payload.at(-1) === "A" ? "B" : "A"}.${signature}`;
  const tamperedSignature = `${prefix}.${payload}.${signature.slice(0, -1)}${signature.at(-1) === "a" ? "b" : "a"}`;

  for (const [candidate, key] of [
    [tamperedPayload, SECRET],
    [tamperedSignature, SECRET],
    [token, "different-phase-e-signing-key-that-is-long-enough"],
  ]) {
    await expectSecurityRejection(
      () => verifyAiCapabilityToken(candidate, key, { binding: bindingA, nowSeconds: NOW + 1 }),
      "invalid_ai_capability_signature",
      401,
    );
  }
});

test("wrapper rate limitu używa wyłącznie atomowego RPC z zaufanym UUID", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  };
  await consumeAiRateLimit(client, {
    scope: "AI.VOICE.SIMULATE",
    subjectId: TENANT_A_PROVIDER.toUpperCase(),
    limit: 3,
    windowSeconds: 3600,
  });
  assert.deepEqual(calls, [{
    name: "security_consume_rate_limit",
    args: {
      p_scope: "ai.voice.simulate",
      p_subject_id: TENANT_A_PROVIDER,
      p_limit: 3,
      p_window_seconds: 3600,
    },
  }]);

  await expectSecurityRejection(
    () => consumeAiRateLimit({ rpc: async () => ({ data: false, error: null }) }, {
      scope: "ai.voice.simulate",
      subjectId: TENANT_A_PROVIDER,
      limit: 3,
      windowSeconds: 3600,
    }),
    "ai_rate_limit_exceeded",
    429,
  );
  await expectSecurityRejection(
    () => consumeAiRateLimit({ rpc: async () => ({ data: null, error: { code: "db_error" } }) }, {
      scope: "ai.voice.simulate",
      subjectId: TENANT_A_PROVIDER,
      limit: 3,
      windowSeconds: 3600,
    }),
    "ai_rate_limit_unavailable",
    503,
  );
});

test("moduł nie używa trwałego sekretu integracji jako bearer", () => {
  const source = readFileSync(join(ROOT, "supabase/functions/_shared/aiSecurity.ts"), "utf8");
  assert.doesNotMatch(source, /VOICE_INTERNAL_SECRET/);
  assert.doesNotMatch(source, /Authorization\s*:\s*[`"']Bearer/);
  assert.match(source, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(source, /provider_id/);
  assert.match(source, /config_id/);
  assert.match(source, /call_id/);
  assert.match(source, /persona_key/);
  assert.match(source, /nonce/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const readSource = (path) => readFileSync(join(ROOT, path), "utf8");

const assertOrdered = (source, entries, label) => {
  let cursor = -1;
  for (const entry of entries) {
    const next = source.indexOf(entry, cursor + 1);
    assert.ok(next > cursor, `${label}: brak lub zła kolejność: ${entry}`);
    cursor = next;
  }
};

test("ai-chat limituje użytkownika z JWT przed odczytem sekretów i wywołaniem providera", () => {
  const source = readSource("supabase/functions/ai-chat/index.ts");
  const handler = source.slice(source.indexOf("serve(async (req) =>"));

  assert.match(source, /import \{ consumeAiRateLimit \} from '\.\.\/_shared\/aiSecurity\.ts'/);
  assert.match(source, /readJsonBody,/);
  assert.match(source, /const AI_CHAT_MAX_BODY_BYTES = 9_000_000/);
  assert.match(handler, /const body = await readJsonBody\(req, AI_CHAT_MAX_BODY_BYTES/);
  assert.doesNotMatch(handler, /req\.json\(/);
  assert.match(source, /const AI_CHAT_USER_BURST_LIMIT = 30/);
  assert.match(source, /const AI_CHAT_USER_DAILY_LIMIT = 300/);
  assert.match(source, /const AI_CHAT_IMAGE_USER_DAILY_LIMIT = 20/);
  assert.match(
    handler,
    /scope: 'ai\.chat\.user\.burst',\s*subjectId: identity\.userId,\s*limit: AI_CHAT_USER_BURST_LIMIT,\s*windowSeconds: 600/,
  );
  assert.match(
    handler,
    /scope: 'ai\.chat\.user\.daily',\s*subjectId: identity\.userId,\s*limit: AI_CHAT_USER_DAILY_LIMIT,\s*windowSeconds: 86_400/,
  );
  assert.match(
    handler,
    /scope: 'ai\.chat\.image\.user\.daily',\s*subjectId: identity\.userId,\s*limit: AI_CHAT_IMAGE_USER_DAILY_LIMIT,\s*windowSeconds: 86_400/,
  );
  assertOrdered(handler, [
    "const identity = await requireUser(req, supabase)",
    "if (encodedSize > MAX_FILE_BYTES_BASE64)",
    "if (!flagEnabled('ai_engine_enabled'))",
    "scope: 'ai.chat.user.burst'",
    "scope: 'ai.chat.user.daily'",
    "const secretCache = new Map<string, string | null>()",
    ".from('ai_providers')",
    "fetch(",
  ], "ai-chat");
  assert.doesNotMatch(handler, /subjectId:\s*(?:body|request|payload|input)(?:\.|\[)/);
  assert.doesNotMatch(handler, /subjectId:\s*(?:body\.)?(?:userId|user_id|tenantId|tenant_id)/);
});

test("ai-chat rozlicza każde wywołanie providera i ogranicza fallbacki oraz czas", () => {
  const source = readSource("supabase/functions/ai-chat/index.ts");

  assert.match(source, /const MAX_CONCURRENT_PROVIDER_CALLS = 2/);
  assert.match(source, /const MAX_PROVIDER_ATTEMPTS_PER_REQUEST = 3/);
  assert.match(source, /const AI_CHAT_USER_PROVIDER_CALL_BURST_LIMIT = 12/);
  assert.match(source, /const AI_CHAT_USER_PROVIDER_CALL_DAILY_LIMIT = 400/);
  assert.match(source, /const AI_CHAT_PROVIDER_HOURLY_LIMIT = 1_000/);
  assert.match(source, /const AI_CHAT_PROVIDER_DAILY_LIMIT = 5_000/);
  assert.match(source, /const enforceProviderCallLimits = async \(providerId: string\)/);
  assert.match(source, /scope: 'ai\.chat\.provider_call\.user\.burst'[\s\S]*?subjectId: identity\.userId/);
  assert.match(source, /scope: 'ai\.chat\.provider_call\.user\.daily'[\s\S]*?subjectId: identity\.userId/);
  assert.match(source, /scope: 'ai\.chat\.provider\.hourly'[\s\S]*?subjectId: providerId/);
  assert.match(source, /scope: 'ai\.chat\.provider\.daily'[\s\S]*?subjectId: providerId/);
  assert.match(source, /attemptedProviderIds\.has\(p\.id\)/);
  assert.match(source, /providerAttempts >= MAX_PROVIDER_ATTEMPTS_PER_REQUEST/);
  assert.match(source, /if \(providerErr instanceof SecurityError\) throw providerErr/);

  const fetchCount = (source.match(/\bfetch\(/g) ?? []).length;
  const timeoutCount = (source.match(/signal: AbortSignal\.timeout\(AI_PROVIDER_TIMEOUT_MS\)/g) ?? []).length;
  assert.equal(fetchCount, 9);
  assert.equal(timeoutCount, fetchCount);
});

test("ai-assistant stosuje limity akcji wyłącznie do identity.userId przed providerem", () => {
  const source = readSource("supabase/functions/ai-assistant/index.ts");
  const handler = source.slice(source.indexOf("serve(async (req) =>"));

  assert.match(source, /import \{ consumeAiRateLimit \} from "\.\.\/_shared\/aiSecurity\.ts";/);
  assert.match(source, /readJsonBody,/);
  assert.match(source, /const ASSISTANT_MAX_BODY_BYTES = 9_000_000/);
  assert.match(handler, /await readJsonBody\([\s\S]*?ASSISTANT_MAX_BODY_BYTES/);
  assert.doesNotMatch(handler, /req\.json\(/);
  assert.match(source, /interpret: \{ burstLimit: 30, burstWindowSeconds: 600, dailyLimit: 200 \}/);
  assert.match(source, /transcribe: \{ burstLimit: 5, burstWindowSeconds: 3_600, dailyLimit: 20 \}/);
  assert.match(source, /speak: \{ burstLimit: 20, burstWindowSeconds: 3_600, dailyLimit: 100 \}/);
  assert.match(source, /scope: `ai\.assistant\.\$\{action\}\.user\.burst`/);
  assert.match(source, /scope: `ai\.assistant\.\$\{action\}\.user\.daily`/);
  assert.match(source, /subjectId: verifiedUserId/g);

  for (const action of ["interpret", "transcribe", "speak"]) {
    assert.match(
      handler,
      new RegExp(`await enforceAssistantRateLimits\\(admin, identity\\.userId, "${action}"\\);`),
    );
  }
  assertOrdered(handler, [
    "const identity = await requireUser(req, admin);",
    'if (action === "interpret")',
    'await enforceAssistantRateLimits(admin, identity.userId, "interpret");',
    "await interpretCommand(text, locale, admin)",
  ], "ai-assistant interpret");
  assertOrdered(handler, [
    'action === "transcribe"',
    'await enforceAssistantRateLimits(admin, identity.userId, "transcribe");',
    "await transcribeAudio(audio, mimeType, admin)",
  ], "ai-assistant transcribe");
  assertOrdered(handler, [
    'action === "speak"',
    'await enforceAssistantRateLimits(admin, identity.userId, "speak");',
    "await generateSpeech(text, requestedVoice, admin)",
  ], "ai-assistant speak");
  assert.doesNotMatch(
    handler,
    /enforceAssistantRateLimits\(admin,\s*(?:body|request|payload|input)(?:\.|\[)/,
  );

  const fetchCount = (source.match(/\bfetch\(/g) ?? []).length;
  const timeoutCount = (source.match(/signal: AbortSignal\.timeout\(ASSISTANT_PROVIDER_TIMEOUT_MS\)/g) ?? []).length;
  assert.equal(fetchCount, 3);
  assert.equal(timeoutCount, fetchCount);
});

test("wspólny limiter AI pozostaje atomowy, service-only i zwraca bezpieczne 429", () => {
  const helper = readSource("supabase/functions/_shared/aiSecurity.ts");
  const migration = readSource("supabase/migrations/20260801142000_phase_c_storage_lockdown.sql");

  assert.match(helper, /client\.rpc\("security_consume_rate_limit"/);
  assert.match(helper, /throw new SecurityError\(429, "ai_rate_limit_exceeded", "Przekroczono limit operacji AI"\)/);
  assert.doesNotMatch(helper, /throw new SecurityError\(429,[^\n]*(?:limit:|windowSeconds|subjectId)/);
  assert.match(migration, /ON CONFLICT \(scope, subject_id\) DO UPDATE/);
  assert.match(migration, /IF auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.security_consume_rate_limit[\s\S]*?TO service_role/);
});

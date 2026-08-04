import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const readHandler = (path, marker) => {
  const source = readFileSync(join(ROOT, path), "utf8");
  const handlerStart = source.indexOf(marker);
  assert.ok(handlerStart >= 0, `${path}: brak handlera`);
  return { source, handler: source.slice(handlerStart) };
};

const assertOrdered = (source, entries, label) => {
  let cursor = -1;
  for (const entry of entries) {
    const next = source.indexOf(entry, cursor + 1);
    assert.ok(next > cursor, `${label}: brak lub zła kolejność: ${entry}`);
    cursor = next;
  }
};

test("voice-agent-simulate limituje zweryfikowanego użytkownika i providera przed modelem", () => {
  const { source, handler } = readHandler(
    "supabase/functions/voice-agent-simulate/index.ts",
    "serve(async (req) =>",
  );

  assert.match(source, /import \{ consumeAiRateLimit \} from "\.\.\/_shared\/aiSecurity\.ts"/);
  assert.match(source, /const SIMULATION_USER_HOURLY_LIMIT = 3;/);
  assert.match(source, /const SIMULATION_PROVIDER_DAILY_LIMIT = 20;/);
  assert.match(
    handler,
    /await consumeAiRateLimit\(admin, \{\s*scope: "ai\.voice\.simulate\.user\.hourly",\s*subjectId: identity\.userId,\s*limit: SIMULATION_USER_HOURLY_LIMIT,\s*windowSeconds: 3_600,\s*\}\);/,
  );
  assert.match(
    handler,
    /await consumeAiRateLimit\(admin, \{\s*scope: "ai\.voice\.simulate\.provider\.daily",\s*subjectId: provider\.id,\s*limit: SIMULATION_PROVIDER_DAILY_LIMIT,\s*windowSeconds: 86_400,\s*\}\);/,
  );
  assertOrdered(handler, [
    "const identity = await requireUser(req, admin);",
    "const provider = await resolveProviderForUser(admin, identity, requestedProviderId);",
    "const { data: cfg",
    'scope: "ai.voice.simulate.user.hourly"',
    'scope: "ai.voice.simulate.provider.daily"',
    'let apiKey = await getSecret(admin, "ANTHROPIC_API_KEY");',
    "let scenario = safeText(body?.scenario, 500);",
  ], "voice-agent-simulate");
  assert.doesNotMatch(handler, /subjectId:\s*(?:body|requestedProviderId)/);
});

test("getrido-ai-execute limituje administratora po JWT przed wywołaniem ai-chat", () => {
  const { source, handler } = readHandler(
    "supabase/functions/getrido-ai-execute/index.ts",
    "serve(async (req) =>",
  );

  assert.match(source, /import \{ consumeAiRateLimit \} from "\.\.\/_shared\/aiSecurity\.ts"/);
  assert.match(source, /const ADMIN_AI_EXECUTE_HOURLY_LIMIT = 30;/);
  assert.match(
    handler,
    /await consumeAiRateLimit\(admin, \{\s*scope: "ai\.admin\.execute\.user\.hourly",\s*subjectId: identity\.userId,\s*limit: ADMIN_AI_EXECUTE_HOURLY_LIMIT,\s*windowSeconds: 3_600,\s*\}\);/,
  );
  assertOrdered(handler, [
    "const identity = await requireAdmin(req, admin);",
    "if (!query || query.length > MAX_QUERY_LENGTH)",
    'scope: "ai.admin.execute.user.hourly"',
    "const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`",
  ], "getrido-ai-execute");
  assert.doesNotMatch(handler, /subjectId:\s*(?:body|input)/);
});

test("ai-generate-call-scripts limituje użytkownika i autoryzowaną konfigurację przed zapisem", () => {
  const { source, handler } = readHandler(
    "supabase/functions/ai-generate-call-scripts/index.ts",
    "Deno.serve(async (req) =>",
  );

  assert.match(source, /import \{ consumeAiRateLimit \} from '\.\.\/_shared\/aiSecurity\.ts'/);
  assert.match(source, /const SCRIPT_GENERATION_USER_HOURLY_LIMIT = 5;/);
  assert.match(source, /const SCRIPT_GENERATION_CONFIG_DAILY_LIMIT = 10;/);
  assert.match(
    handler,
    /await consumeAiRateLimit\(supabase, \{\s*scope: 'ai\.call_scripts\.generate\.user\.hourly',\s*subjectId: identity\.userId,\s*limit: SCRIPT_GENERATION_USER_HOURLY_LIMIT,\s*windowSeconds: 3_600,\s*\}\);/,
  );
  assert.match(
    handler,
    /await consumeAiRateLimit\(supabase, \{\s*scope: 'ai\.call_scripts\.generate\.config\.daily',\s*subjectId: config\.id,\s*limit: SCRIPT_GENERATION_CONFIG_DAILY_LIMIT,\s*windowSeconds: 86_400,\s*\}\);/,
  );
  assertOrdered(handler, [
    "const identity = await requireUser(req, supabase);",
    ".from('ai_agent_configs')",
    "config.user_id !== identity.userId",
    ".from('ai_call_business_profiles')",
    "if (!businessProfile?.business_description)",
    "scope: 'ai.call_scripts.generate.user.hourly'",
    "scope: 'ai.call_scripts.generate.config.daily'",
    ".from('ai_call_scripts')",
    ".insert(scripts)",
  ], "ai-generate-call-scripts");
  assert.doesNotMatch(handler, /subjectId:\s*(?:body|configId)/);
  assert.match(handler, /version: 1 \+ Math\.max\(0,/);
});


import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveVoiceProductionCanary,
  VOICE_PRODUCTION_CANARY_AGENT_ID,
  VOICE_PRODUCTION_CANARY_ENABLED,
  VOICE_PRODUCTION_CANARY_PROVIDER_ID,
} from "./voiceProductionCanary.ts";
import { executePhase1Fallback, type Phase1VoiceRouting } from "./voicePhase1Runtime.ts";
import { buildPhase1AnthropicRequest, consumePhase1AnthropicSse } from "./voicePhase1ModelAdapter.ts";
import { resolveVoiceLlmRoute } from "./voicePhase1Route.ts";

const environment = (overrides: Record<string, string | undefined> = {}) => {
  const values: Record<string, string | undefined> = {
    [VOICE_PRODUCTION_CANARY_ENABLED]: "true",
    [VOICE_PRODUCTION_CANARY_PROVIDER_ID]: "provider-canary",
    [VOICE_PRODUCTION_CANARY_AGENT_ID]: "agent-canary",
    ...overrides,
  };
  return (name: string) => values[name];
};

test("canary requires the explicit kill switch and both matching identifiers", () => {
  assert.deepEqual(
    resolveVoiceProductionCanary("provider-canary", "agent-canary", environment()),
    { enabled: true, reason: "enabled" },
  );
  assert.equal(resolveVoiceProductionCanary("provider-canary", "agent-canary", environment({
    [VOICE_PRODUCTION_CANARY_ENABLED]: "false",
  })).reason, "kill_switch_off");
  assert.equal(resolveVoiceProductionCanary("provider-canary", "agent-canary", environment({
    [VOICE_PRODUCTION_CANARY_AGENT_ID]: undefined,
  })).reason, "target_incomplete");
});

test("provider and ElevenLabs agent are independent tenant boundaries", () => {
  assert.equal(resolveVoiceProductionCanary("provider-other", "agent-canary", environment()).reason, "provider_mismatch");
  assert.equal(resolveVoiceProductionCanary("provider-canary", "agent-other", environment()).reason, "agent_mismatch");
  assert.equal(resolveVoiceProductionCanary("provider-other", "agent-other", environment()).enabled, false);
});

test("Custom LLM route resolves both ElevenLabs path and legacy query parameters", () => {
  assert.deepEqual(resolveVoiceLlmRoute(new URL(
    "https://example.test/functions/v1/voice-agent-llm/provider-path/workshop_secretary/llm/chat/completions",
  )), { providerId: "provider-path", personaKey: "workshop_secretary" });
  assert.deepEqual(resolveVoiceLlmRoute(new URL(
    "https://example.test/functions/v1/voice-agent-llm?provider_id=provider-query&persona_key=custom",
  )), { providerId: "provider-query", personaKey: "custom" });
});

test("runtime entrypoints use the shared pair gate and do not embed canary identifiers", () => {
  const files = [
    "../voice-agent-llm/index.ts",
    "../voice-agent-chat/index.ts",
    "../voice-agent-tools/index.ts",
    "../voice-call-postprocess/index.ts",
    "../voice-agent-sync/index.ts",
  ];
  for (const relativePath of files) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /resolveVoiceProductionCanary/);
    assert.doesNotMatch(source, /provider-canary|agent-canary/);
  }
});

test("Phase 1 runtime is migration-free and limited to LLM plus chat", () => {
  const sources = [
    "../voice-agent-llm/index.ts",
    "../voice-agent-chat/index.ts",
    "./voiceProductionCanary.ts",
    "./voicePhase1Runtime.ts",
    "./voicePhase1ModelAdapter.ts",
    "./voicePhase1SecretReader.ts",
    "./voicePhase1AgentConfig.ts",
    "./voicePhase1Route.ts",
    "./anthropicSse.ts",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const [llm, chat] = sources;
  const runtime = sources.join("\n");

  for (const table of ["ai_function_mapping", "ai_providers", "voice_call_transcripts", "voice_call_outcomes"]) {
    assert.doesNotMatch(runtime, new RegExp(`\\.from\\(["']${table}["']\\)`));
  }
  for (const newColumn of ["model_timeout_ms", "max_tool_rounds", "max_output_tokens", "backup_model_override", "voice_conversation_id"]) {
    assert.doesNotMatch(runtime, new RegExp(`select\\([^)]*${newColumn}`));
  }
  assert.doesNotMatch(llm, /conversation_id\s*:/);
  assert.doesNotMatch(chat, /conversation_id\s*:/);
  assert.match(chat, /admin\s*\.from\("voice_agent_personas"\)/);
  assert.match(chat, /admin\.from\("voice_agent_knowledge"\)/);
  assert.match(llm, /admin\.from\("voice_agent_configs"\)/);
  assert.doesNotMatch(runtime, /from ["']\.\/voiceAiRouting\.ts["']/);
  assert.doesNotMatch(runtime, /from ["']\.\/aiSecrets\.ts["']/);
  assert.doesNotMatch(runtime, /from ["']\.\/translationProvider\.ts["']/);
});

test("Phase 1 preserves legacy execution and enables streaming only behind the pair gate", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  assert.match(chat, /if \(!canary\.enabled\) \{/);
  assert.match(chat, /max_tokens: 600/);
  assert.match(chat, /for \(let round = 0; round < 5; round\+\+\)/);
  assert.match(chat, /body: JSON\.stringify\(\{ action: name, provider_id: providerId, persona_key: personaKey, is_test: testMode, \.\.\.input \}\)/);
  assert.match(chat, /claude-haiku-4-5-20251001/);
  assert.match(chat, /timeoutMs: 8_000/);
  assert.match(llm, /response_stream: canary\.enabled && stream/);
  assert.match(llm, /\.\.\.\(canary\.enabled \? \{ elevenlabs_agent_id:/);
});

test("Phase 1 is unbuffered and propagates client cancellation without fallback or tools", () => {
  const llm = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");

  for (const source of [llm, chat]) {
    assert.match(source, /"Cache-Control": "no-cache, no-transform"/);
    assert.match(source, /"X-Accel-Buffering": "no"/);
  }
  assert.match(chat, /AbortSignal\.any\(\[req\.signal, responseAbort\.signal\]\)/);
  assert.match(chat, /if \(canaryAbortSignal\.aborted\)[\s\S]{0,180}do_not_retry: true/);
  assert.match(chat, /requestError as Error & \{ allowFallback\?: boolean \}\)\.allowFallback = false/);
  assert.match(chat, /cancel\(\) \{[\s\S]{0,100}responseAbort\.abort/);
  assert.match(llm, /AbortSignal\.any\(\[req\.signal, AbortSignal\.timeout/);
});

const phase1Routing = (): Phase1VoiceRouting => ({
  primary: {
    providerKey: "claude_sonnet",
    providerName: "primary",
    model: "claude-sonnet-4-6",
    timeoutMs: 8_000,
    adapterKey: "anthropic_messages",
    secretKey: "ANTHROPIC_API_KEY",
    endpoint: "https://api.anthropic.com/v1/messages",
  },
  fallback: {
    providerKey: "claude_haiku",
    providerName: "fallback",
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 8_000,
    adapterKey: "anthropic_messages",
    secretKey: "ANTHROPIC_API_KEY",
    endpoint: "https://api.anthropic.com/v1/messages",
  },
  allowFallback: true,
  maxToolRounds: 3,
  maxOutputTokens: 400,
});

test("Phase 1 falls back once before output", async () => {
  const attempts: string[] = [];
  const result = await executePhase1Fallback(phase1Routing(), async (candidate) => {
    attempts.push(candidate.providerKey);
    if (candidate.providerKey === "claude_sonnet") throw new DOMException("timeout", "TimeoutError");
    return "ok";
  });
  assert.equal(result.value, "ok");
  assert.equal(result.attempts, 2);
  assert.deepEqual(attempts, ["claude_sonnet", "claude_haiku"]);
});

test("Phase 1 never falls back after first output or client cancellation", async () => {
  const attempts: string[] = [];
  await assert.rejects(() => executePhase1Fallback(phase1Routing(), async (candidate) => {
    attempts.push(candidate.providerKey);
    const error = new DOMException("client disconnected", "AbortError") as DOMException & { allowFallback?: boolean };
    error.allowFallback = false;
    throw error;
  }), /client disconnected/);
  assert.deepEqual(attempts, ["claude_sonnet"]);
});

test("Phase 1 adapter requests real Anthropic SSE with tools and emits text incrementally", async () => {
  const routing = phase1Routing();
  const request = buildPhase1AnthropicRequest(
    routing.primary,
    "synthetic-key",
    "system",
    [{ role: "user", content: "test" }],
    [{ name: "check_availability", description: "test", input_schema: { type: "object" } }],
    routing.maxOutputTokens,
  );
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 400);
  assert.equal(body.tools[0].name, "check_availability");
  assert.doesNotMatch(String(request.init.body), /synthetic-key/);

  const events = [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "Szyb" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ko" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  const deltas: string[] = [];
  const result = await consumePhase1AnthropicSse(new Response(events, {
    headers: { "Content-Type": "text/event-stream" },
  }), (delta) => deltas.push(delta));
  assert.deepEqual(deltas, ["Szyb", "ko"]);
  assert.equal(result.text, "Szybko");
});

test("production preflight is read-only and rollback preserves archived content", () => {
  const preflight = readFileSync(new URL("../../tests/voice_production_canary_preflight.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../../tests/voice_production_canary_schema_rollback.sql", import.meta.url), "utf8");
  const runbook = readFileSync(new URL("../../../docs/voice-agent-production-canary.md", import.meta.url), "utf8");
  const executablePreflight = preflight.replace(/^\s*--.*$/gm, "");

  assert.match(preflight, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(preflight, /ROLLBACK;/);
  assert.doesNotMatch(executablePreflight, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
  assert.match(rollback, /ROLLBACK_VOICE_CANARY_SCHEMA/);
  assert.match(rollback, /NIE wykonywać:[\s\S]*DROP COLUMN/);
  assert.match(rollback, /voice_deduplication_archive/);
  assert.match(runbook, /VOICE_PRODUCTION_CANARY_ENABLED=false/);
  assert.match(runbook, /\*\*NOT READY\*\*/);
});

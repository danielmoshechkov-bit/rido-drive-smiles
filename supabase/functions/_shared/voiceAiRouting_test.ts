import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  executeVoiceModelFallback,
  eligibleVoiceProviders,
  hasVoiceRoutingAdminRole,
  publicVoiceRoutingPayload,
  resolveVoiceRouting,
  validateVoiceRouting,
  voiceCapableProviders,
  type VoiceAdapterCapability,
  type VoiceProviderConfig,
  type VoiceRoutingRecord,
} from "./voiceAiRouting.ts";

const providers: VoiceProviderConfig[] = [
  { provider_key: "claude_sonnet", display_name: "Claude Sonnet", is_enabled: true, default_model: "claude-sonnet-4-6", timeout_seconds: 15 },
  { provider_key: "claude_haiku", display_name: "Claude Haiku", is_enabled: true, default_model: "claude-haiku-4-5-20251001", timeout_seconds: 10 },
  { provider_key: "openai", display_name: "OpenAI GPT-4o", is_enabled: true, default_model: "gpt-4o", timeout_seconds: 15 },
  { provider_key: "gemini", display_name: "Gemini", is_enabled: true, default_model: "gemini-2.5-flash", timeout_seconds: 10 },
  { provider_key: "elevenlabs", display_name: "ElevenLabs", is_enabled: true, default_model: "scribe_v2", timeout_seconds: 10 },
  { provider_key: "imagen3", display_name: "Imagen", is_enabled: true, default_model: "imagen-3.0-generate", timeout_seconds: 10 },
];

const routing: VoiceRoutingRecord = {
  function_key: "voice_agent",
  provider_key: "claude_sonnet",
  model_override: "claude-sonnet-4-6",
  backup_provider_key: "claude_haiku",
  backup_model_override: "claude-haiku-4-5-20251001",
  allow_fallback: true,
  is_enabled: true,
  model_timeout_ms: 12_000,
  max_tool_rounds: 3,
  max_output_tokens: 400,
};

const secrets = { ANTHROPIC_API_KEY: true, OPENAI_API_KEY: true };

test("wybór dostawcy i modelu używa aktywnego rekordu voice_agent", () => {
  const resolved = resolveVoiceRouting(routing, providers, secrets);
  assert.equal(resolved.primary.providerKey, "claude_sonnet");
  assert.equal(resolved.primary.model, "claude-sonnet-4-6");
  assert.equal(resolved.fallback?.providerKey, "claude_haiku");
  assert.equal(resolved.maxToolRounds, 3);
  assert.equal(resolved.maxOutputTokens, 400);
});

test("bez poprawnego starego routingu domyślnie wybierany jest aktywny Claude Sonnet", () => {
  const resolved = resolveVoiceRouting(null, [providers[1], providers[0]], secrets);
  assert.equal(resolved.primary.providerKey, "claude_sonnet");
  assert.equal(resolved.primary.model, "claude-sonnet-4-6");
});

test("OpenAI i Anthropic są wybieralne przez kompletne adaptery rozmowy", () => {
  const openAiRouting = {
    ...routing,
    provider_key: "openai",
    model_override: "gpt-4o",
    backup_provider_key: "claude_sonnet",
    backup_model_override: "claude-sonnet-4-6",
  };
  const resolved = resolveVoiceRouting(openAiRouting, providers, secrets);
  assert.equal(resolved.primary.adapterKey, "openai_chat_completions");
  assert.equal(resolved.primary.secretKey, "OPENAI_API_KEY");
  assert.equal(resolved.fallback?.adapterKey, "anthropic_messages");
});

test("jawny rejestr pokazuje nowego dostawcę dopiero po dodaniu kompletnego adaptera", () => {
  const futureProvider: VoiceProviderConfig = {
    provider_key: "future_llm",
    display_name: "Future LLM",
    is_enabled: true,
    default_model: "future-chat-1",
    timeout_seconds: 10,
  };
  const incomplete: VoiceAdapterCapability = {
    adapterKey: "future_adapter",
    providerKeys: ["future_llm"],
    secretKey: "FUTURE_API_KEY",
    endpoint: "https://invalid.local/v1/chat",
    streaming: true,
    toolCalling: false,
    timeout: true,
    safeFallback: true,
    supportsModel: (model) => model.startsWith("future-chat-"),
  };
  assert.deepEqual(eligibleVoiceProviders([futureProvider], { FUTURE_API_KEY: true }, [incomplete]), []);
  const complete = { ...incomplete, toolCalling: true };
  assert.deepEqual(
    eligibleVoiceProviders([futureProvider], { FUTURE_API_KEY: true }, [complete]).map((provider) => provider.provider_key),
    ["future_llm"],
  );
});

test("capabilities odrzucają ElevenLabs, STT/TTS, Gemini bez adaptera i modele graficzne", () => {
  assert.deepEqual(
    voiceCapableProviders(providers).map((provider) => provider.provider_key),
    ["claude_sonnet", "claude_haiku", "openai"],
  );
});

test("nieaktywny albo nieobsługiwany model jest odrzucany", () => {
  const invalidProviders = providers.map((provider) => provider.provider_key === "claude_sonnet"
    ? { ...provider, is_enabled: false }
    : provider);
  assert.match(validateVoiceRouting(routing, invalidProviders, secrets)[0], /Główny dostawca/);
  assert.match(validateVoiceRouting(routing, providers, {})[0], /Główny dostawca/);
  assert.match(validateVoiceRouting({ ...routing, provider_key: "gemini", model_override: "gemini-2.5-flash" }, providers, secrets)[0], /Główny dostawca/);
  assert.match(validateVoiceRouting({ ...routing, model_override: "claude-unknown" }, providers, secrets)[0], /Główny model/);
});

test("fallback uruchamia zapasowy model po błędzie lub timeout", async () => {
  const resolved = resolveVoiceRouting(routing, providers, secrets);
  const calls: string[] = [];
  const result = await executeVoiceModelFallback(resolved, async (candidate) => {
    calls.push(candidate.providerKey);
    if (candidate.providerKey === "claude_sonnet") throw new DOMException("timeout", "TimeoutError");
    return "odpowiedź";
  });
  assert.equal(result.value, "odpowiedź");
  assert.equal(result.attempts, 2);
  assert.deepEqual(calls, ["claude_sonnet", "claude_haiku"]);
});

test("fallback nie powtarza modelu po rozpoczęciu strumienia", async () => {
  const resolved = resolveVoiceRouting(routing, providers, secrets);
  const calls: string[] = [];
  await assert.rejects(
    executeVoiceModelFallback(resolved, async (candidate) => {
      calls.push(candidate.providerKey);
      const error = new Error("stream interrupted") as Error & { allowFallback?: boolean };
      error.allowFallback = false;
      throw error;
    }),
    /stream interrupted/,
  );
  assert.deepEqual(calls, ["claude_sonnet"]);
});

test("routing globalny może zmieniać wyłącznie administrator", () => {
  assert.equal(hasVoiceRoutingAdminRole(["admin"]), true);
  assert.equal(hasVoiceRoutingAdminRole(["user", "service_provider"]), false);
});

test("publiczna odpowiedź routingu nie zawiera kluczy API", () => {
  const payload = publicVoiceRoutingPayload(routing, providers, secrets);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /api_key|ciphertext|secret_key/i);
  assert.deepEqual(payload.providers.map((provider) => provider.provider_key), ["claude_sonnet", "claude_haiku", "openai"]);
  assert.ok(payload.providers.every((provider) => provider.key_configured));
});

test("kompatybilny dostawca bez klucza jest widoczny tylko jako nieskonfigurowany", () => {
  const payload = publicVoiceRoutingPayload(routing, providers, { ANTHROPIC_API_KEY: true });
  const openAi = payload.providers.find((provider) => provider.provider_key === "openai");
  assert.equal(openAi?.key_configured, false);
  assert.match(validateVoiceRouting({ ...routing, provider_key: "openai", model_override: "gpt-4o" }, providers, { ANTHROPIC_API_KEY: true })[0], /Główny dostawca/);
});

test("oba ekrany korzystają z jednego komponentu i rekordu voice_agent", () => {
  const mappingPanel = readFileSync(new URL("../../../src/components/admin/AIFunctionMappingPanel.tsx", import.meta.url), "utf8");
  const voicePanel = readFileSync(new URL("../../../src/components/admin/AIVoiceAgentSettings.tsx", import.meta.url), "utf8");
  const endpoint = readFileSync(new URL("../admin-voice-ai-routing/index.ts", import.meta.url), "utf8");
  assert.match(mappingPanel, /VoiceConversationModelSettings compact/);
  assert.match(voicePanel, /<VoiceConversationModelSettings/);
  assert.match(endpoint, /VOICE_FUNCTION_KEY/);
  assert.match(endpoint, /\.eq\("function_key", VOICE_FUNCTION_KEY\)/);
  assert.match(endpoint, /\.eq\("role", "admin"\)/);
});

test("lokalny podgląd używa jednego syntetycznego rekordu i blokuje sieć oraz zapis", () => {
  const preview = readFileSync(new URL("../../../src/pages/VoiceAiRoutingLocalPreview.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../../../src/components/admin/VoiceConversationModelSettings.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../../../src/hooks/useVoiceAiRouting.ts", import.meta.url), "utf8");
  const main = readFileSync(new URL("../../../src/main.tsx", import.meta.url), "utf8");
  assert.equal((preview.match(/previewData=\{voiceAiRoutingPreviewData\}/g) || []).length, 2);
  assert.doesNotMatch(preview, /supabase/i);
  assert.match(component, /useVoiceAiRouting\(!isLocalPreview\)/);
  assert.match(component, /disabled=\{isPreviewMode \|\|/);
  assert.match(component, /import\("\.\/voiceAiRoutingPreviewData"\)/);
  assert.match(component, /automatyczny podgląd lokalny/);
  assert.match(hook, /enabled,/);
  assert.doesNotMatch(hook, /import \{ supabase \} from/);
  assert.match(hook, /await loadSupabase\(\)/);
  assert.match(main, /import\.meta\.env\.DEV/);
  assert.match(main, /window\.location\.pathname/);
  assert.match(main, /import\("\.\/pages\/VoiceAiRoutingLocalPreview\.tsx"\)/);
  assert.doesNotMatch(main, /import App from/);
  assert.match(main, /import\("\.\/App\.tsx"\)/);
  assert.match(main, /params\.get\("voicePreview"\) === "1"/);
  assert.match(preview, /Funkcje → AI/);
  assert.match(preview, /AI Voice Agent/);
});

test("UI nie pobiera legacy klucza, a backend loguje first_text podczas prawdziwego SSE", () => {
  const hub = readFileSync(new URL("../../../src/components/admin/AIHubPanel.tsx", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../voice-agent-chat/index.ts", import.meta.url), "utf8");
  const llmProxy = readFileSync(new URL("../voice-agent-llm/index.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../migrations/20260802090000_voice_ai_global_routing.sql", import.meta.url), "utf8");
  assert.doesNotMatch(
    hub,
    /from\(["']ai_providers["']\)\s*\.select\(["']\*["']\)/s,
  );
  assert.doesNotMatch(hub, /api_key_encrypted/);
  assert.match(migration, /REVOKE ALL ON public\.ai_providers FROM authenticated/);
  assert.match(migration, /ON CONFLICT \(function_key\) DO NOTHING/);
  assert.match(migration, /CHECK \(model_timeout_ms BETWEEN 1000 AND 30000\)/);
  assert.match(chat, /consumePhase1AnthropicSse\(\w+/);
  assert.match(chat, /logTiming\("first_text"/);
  assert.match(chat, /fallback_used/);
  assert.match(chat, /"X-Accel-Buffering": "no"/);
  assert.match(chat, /"Cache-Control": "no-cache, no-transform"/);
  assert.match(llmProxy, /return new Response\(measured/);
  assert.match(llmProxy, /"X-Accel-Buffering": "no"/);
  assert.match(llmProxy, /"Cache-Control": "no-cache, no-transform"/);
});

test("magazyn sekretów nadpisuje klucz bez zwracania jego wartości", () => {
  const secretStore = readFileSync(new URL("./aiSecrets.ts", import.meta.url), "utf8");
  const endpoint = readFileSync(new URL("../admin-ai-secrets/index.ts", import.meta.url), "utf8");
  assert.match(secretStore, /\.upsert\(/);
  assert.match(secretStore, /onConflict: "secret_key"/);
  assert.match(endpoint, /statuses,/);
  assert.doesNotMatch(endpoint, /return json\(\{[^}]*value:/s);
});

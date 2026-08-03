export const VOICE_FUNCTION_KEY = "voice_agent";
export const VOICE_ANALYSIS_AGENT_ID = "voice_call_analyzer";

export type VoiceAdapterKey = "anthropic_messages" | "openai_chat_completions" | (string & {});

export interface VoiceAdapterCapability {
  adapterKey: VoiceAdapterKey;
  providerKeys: readonly string[];
  secretKey: string;
  endpoint: string;
  streaming: boolean;
  toolCalling: boolean;
  timeout: boolean;
  safeFallback: boolean;
  supportsModel: (model: string) => boolean;
}

const excludesNonConversationModel = (model: string): boolean =>
  /(elevenlabs|scribe|whisper|tts|stt|speech|audio|imagen|image|dall-e|embedding|moderation)/i.test(model);

export const VOICE_ADAPTER_CAPABILITIES: readonly VoiceAdapterCapability[] = [
  {
    adapterKey: "anthropic_messages",
    providerKeys: ["claude_haiku", "claude_sonnet", "claude_opus"],
    secretKey: "ANTHROPIC_API_KEY",
    endpoint: "https://api.anthropic.com/v1/messages",
    streaming: true,
    toolCalling: true,
    timeout: true,
    safeFallback: true,
    supportsModel: (model) => !excludesNonConversationModel(model) && /^claude-/i.test(model),
  },
  {
    adapterKey: "openai_chat_completions",
    providerKeys: ["openai", "openai_gpt4o", "openai_mini"],
    secretKey: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1/chat/completions",
    streaming: true,
    toolCalling: true,
    timeout: true,
    safeFallback: true,
    supportsModel: (model) => !excludesNonConversationModel(model) && /^gpt-4o(?:-|$)/i.test(model),
  },
] as const;

export const isCompleteVoiceAdapter = (capability: VoiceAdapterCapability): boolean =>
  capability.streaming && capability.toolCalling && capability.timeout && capability.safeFallback;

export function findVoiceAdapterCapability(
  providerKey: string,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): VoiceAdapterCapability | null {
  return registry.find((entry) => isCompleteVoiceAdapter(entry) && entry.providerKeys.includes(providerKey)) || null;
}

export const voiceProviderKeys = (
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): string[] => [...new Set(registry.filter(isCompleteVoiceAdapter).flatMap((entry) => [...entry.providerKeys]))];

export const voiceSecretKeys = (
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): string[] => [...new Set(registry.filter(isCompleteVoiceAdapter).map((entry) => entry.secretKey))];

export interface VoiceProviderConfig {
  provider_key: string;
  display_name: string;
  is_enabled: boolean;
  default_model: string | null;
  timeout_seconds: number | null;
}

export interface VoiceRoutingRecord {
  id?: string;
  function_key: string;
  function_name?: string;
  function_description?: string | null;
  category?: string;
  provider_key: string | null;
  model_override: string | null;
  backup_provider_key: string | null;
  backup_model_override: string | null;
  allow_fallback: boolean;
  is_enabled: boolean;
  model_timeout_ms: number;
  max_tool_rounds: number;
  max_output_tokens: number;
  updated_at?: string | null;
}

export interface VoiceModelCandidate {
  providerKey: string;
  providerName: string;
  model: string;
  timeoutMs: number;
  adapterKey: VoiceAdapterKey;
  secretKey: string;
  endpoint: string;
}

export interface ResolvedVoiceRouting {
  primary: VoiceModelCandidate;
  fallback: VoiceModelCandidate | null;
  allowFallback: boolean;
  maxToolRounds: number;
  maxOutputTokens: number;
}

const DEFAULT_PROVIDER_ORDER = ["claude_sonnet", "claude_haiku", "claude_opus", "openai", "openai_gpt4o", "openai_mini"];

export function isVoiceModelSupported(
  providerKey: string,
  model: string | null | undefined,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): boolean {
  const capability = findVoiceAdapterCapability(providerKey, registry);
  return !!model && !!capability && capability.supportsModel(model);
}

export function voiceCapableProviders(
  providers: VoiceProviderConfig[],
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): VoiceProviderConfig[] {
  return providers.filter((provider) => provider.is_enabled && isVoiceModelSupported(provider.provider_key, provider.default_model, registry));
}

export function eligibleVoiceProviders(
  providers: VoiceProviderConfig[],
  secretConfigured: Record<string, boolean>,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): VoiceProviderConfig[] {
  return voiceCapableProviders(providers, registry).filter((provider) => {
    const capability = findVoiceAdapterCapability(provider.provider_key, registry);
    return !!capability && !!secretConfigured[capability.secretKey];
  });
}

const clampInteger = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const candidateFor = (
  provider: VoiceProviderConfig,
  modelOverride: string | null | undefined,
  timeoutMs: number,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): VoiceModelCandidate | null => {
  const model = modelOverride || provider.default_model;
  const capability = findVoiceAdapterCapability(provider.provider_key, registry);
  if (!model || model !== provider.default_model || !capability?.supportsModel(model)) return null;
  return {
    providerKey: provider.provider_key,
    providerName: provider.display_name,
    model,
    timeoutMs,
    adapterKey: capability.adapterKey,
    secretKey: capability.secretKey,
    endpoint: capability.endpoint,
  };
};

export function validateVoiceRouting(
  record: VoiceRoutingRecord,
  providers: VoiceProviderConfig[],
  secretConfigured: Record<string, boolean>,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): string[] {
  const errors: string[] = [];
  const eligible = eligibleVoiceProviders(providers, secretConfigured, registry);
  const primary = eligible.find((provider) => provider.provider_key === record.provider_key);
  if (!primary) errors.push("Główny dostawca jest nieaktywny, nieobsługiwany lub nie ma skonfigurowanego klucza");
  else if (!candidateFor(primary, record.model_override, record.model_timeout_ms, registry)) {
    errors.push("Główny model nie jest aktywnym modelem skonfigurowanym dla dostawcy");
  }

  if (record.allow_fallback) {
    const fallback = eligible.find((provider) => provider.provider_key === record.backup_provider_key);
    if (!fallback) errors.push("Zapasowy dostawca jest nieaktywny, nieobsługiwany lub nie ma skonfigurowanego klucza");
    else if (!candidateFor(fallback, record.backup_model_override, record.model_timeout_ms, registry)) {
      errors.push("Zapasowy model nie jest aktywnym modelem skonfigurowanym dla dostawcy");
    }
    if (record.backup_provider_key === record.provider_key) errors.push("Dostawca zapasowy musi być inny niż główny");
  }

  if (!Number.isInteger(record.model_timeout_ms) || record.model_timeout_ms < 1_000 || record.model_timeout_ms > 30_000) {
    errors.push("Timeout modelu musi mieścić się w zakresie 1000–30000 ms");
  }
  if (!Number.isInteger(record.max_tool_rounds) || record.max_tool_rounds < 1 || record.max_tool_rounds > 5) {
    errors.push("Liczba rund narzędzi musi mieścić się w zakresie 1–5");
  }
  if (!Number.isInteger(record.max_output_tokens) || record.max_output_tokens < 64 || record.max_output_tokens > 800) {
    errors.push("Limit odpowiedzi musi mieścić się w zakresie 64–800 tokenów");
  }
  return errors;
}

export function resolveVoiceRouting(
  record: VoiceRoutingRecord | null,
  providers: VoiceProviderConfig[],
  secretConfigured: Record<string, boolean>,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
): ResolvedVoiceRouting {
  if (record && !record.is_enabled) throw new Error("VOICE_MODEL_DISABLED");
  const eligible = eligibleVoiceProviders(providers, secretConfigured, registry);
  if (!eligible.length) throw new Error("VOICE_MODEL_NOT_CONFIGURED");

  const byKey = new Map(eligible.map((provider) => [provider.provider_key, provider]));
  const preferred = record?.provider_key ? byKey.get(record.provider_key) : null;
  const primaryProvider = preferred
    || DEFAULT_PROVIDER_ORDER.map((key) => byKey.get(key)).find((provider): provider is VoiceProviderConfig => !!provider)
    || eligible[0];
  if (!primaryProvider) throw new Error("VOICE_MODEL_NOT_CONFIGURED");
  const timeoutMs = clampInteger(record?.model_timeout_ms, 1_000, 30_000, 15_000);
  const primary = candidateFor(primaryProvider, preferred ? record?.model_override : null, timeoutMs, registry)
    || candidateFor(primaryProvider, null, timeoutMs, registry)!;

  let fallback: VoiceModelCandidate | null = null;
  if (record?.allow_fallback) {
    const configuredFallback = record.backup_provider_key ? byKey.get(record.backup_provider_key) : null;
    const fallbackProvider = configuredFallback && configuredFallback.provider_key !== primary.providerKey
      ? configuredFallback
      : eligible.find((provider) => provider.provider_key !== primary.providerKey);
    if (fallbackProvider) {
      fallback = candidateFor(
        fallbackProvider,
        configuredFallback ? record.backup_model_override : null,
        timeoutMs,
        registry,
      ) || candidateFor(fallbackProvider, null, timeoutMs, registry);
    }
  }

  return {
    primary,
    fallback,
    allowFallback: !!record?.allow_fallback && !!fallback,
    maxToolRounds: clampInteger(record?.max_tool_rounds, 1, 5, 3),
    maxOutputTokens: clampInteger(record?.max_output_tokens, 64, 800, 400),
  };
}

export async function executeVoiceModelFallback<T>(
  routing: Pick<ResolvedVoiceRouting, "primary" | "fallback" | "allowFallback">,
  invoke: (candidate: VoiceModelCandidate, attempt: number) => Promise<T>,
): Promise<{ value: T; candidate: VoiceModelCandidate; attempts: number }> {
  const candidates = routing.allowFallback && routing.fallback
    ? [routing.primary, routing.fallback]
    : [routing.primary];
  let lastError: unknown;
  for (let index = 0; index < candidates.length; index++) {
    try {
      const value = await invoke(candidates[index], index + 1);
      return { value, candidate: candidates[index], attempts: index + 1 };
    } catch (error) {
      lastError = error;
      if ((error as { allowFallback?: boolean })?.allowFallback === false) break;
    }
  }
  throw lastError || new Error("VOICE_MODEL_FAILED");
}

export const hasVoiceRoutingAdminRole = (roles: string[]): boolean => roles.includes("admin");

export function publicVoiceRoutingPayload(
  routing: VoiceRoutingRecord,
  providers: VoiceProviderConfig[],
  secretConfigured: Record<string, boolean>,
  registry: readonly VoiceAdapterCapability[] = VOICE_ADAPTER_CAPABILITIES,
) {
  return {
    routing,
    providers: voiceCapableProviders(providers, registry).map((provider) => {
      const capability = findVoiceAdapterCapability(provider.provider_key, registry)!;
      return {
        provider_key: provider.provider_key,
        display_name: provider.display_name,
        default_model: provider.default_model,
        timeout_seconds: provider.timeout_seconds,
        key_configured: !!secretConfigured[capability.secretKey],
        adapter_key: capability.adapterKey,
      };
    }),
  };
}

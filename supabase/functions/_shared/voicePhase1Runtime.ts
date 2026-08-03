export type Phase1VoiceAdapterKey = "anthropic_messages";

export interface Phase1VoiceModelCandidate {
  providerKey: string;
  providerName: string;
  model: string;
  timeoutMs: number;
  adapterKey: Phase1VoiceAdapterKey;
  secretKey: "ANTHROPIC_API_KEY";
  endpoint: "https://api.anthropic.com/v1/messages";
}

export interface Phase1VoiceRouting {
  primary: Phase1VoiceModelCandidate;
  fallback: Phase1VoiceModelCandidate | null;
  allowFallback: boolean;
  maxToolRounds: number;
  maxOutputTokens: number;
}

/**
 * Phase 1 retries only before any response/tool side effect. The invocation
 * marks errors with allowFallback=false after first text or client abort.
 */
export async function executePhase1Fallback<T>(
  routing: Pick<Phase1VoiceRouting, "primary" | "fallback" | "allowFallback">,
  invoke: (candidate: Phase1VoiceModelCandidate, attempt: number) => Promise<T>,
): Promise<{ value: T; candidate: Phase1VoiceModelCandidate; attempts: number }> {
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

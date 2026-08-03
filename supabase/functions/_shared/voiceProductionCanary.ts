export const VOICE_PRODUCTION_CANARY_ENABLED = "VOICE_PRODUCTION_CANARY_ENABLED";
export const VOICE_PRODUCTION_CANARY_PROVIDER_ID = "VOICE_PRODUCTION_CANARY_PROVIDER_ID";
export const VOICE_PRODUCTION_CANARY_AGENT_ID = "VOICE_PRODUCTION_CANARY_ELEVENLABS_AGENT_ID";

export type VoiceProductionCanaryReason =
  | "enabled"
  | "kill_switch_off"
  | "target_incomplete"
  | "provider_mismatch"
  | "agent_mismatch";

export interface VoiceProductionCanaryDecision {
  enabled: boolean;
  reason: VoiceProductionCanaryReason;
}

type ReadEnvironment = (name: string) => string | undefined;

const normalized = (value: string | null | undefined): string => String(value || "").trim();

/**
 * Fail-closed gate for the temporary production canary.
 *
 * The new runtime path is enabled only when the kill switch is exactly `true`
 * and both opaque identifiers match. Callers must obtain `agentId` from the
 * tenant configuration or the verified ElevenLabs payload, never from a
 * browser-controlled flag. The decision deliberately exposes no identifier.
 */
export function resolveVoiceProductionCanary(
  providerId: string | null | undefined,
  agentId: string | null | undefined,
  readEnvironment: ReadEnvironment = (name) => Deno.env.get(name),
): VoiceProductionCanaryDecision {
  if (normalized(readEnvironment(VOICE_PRODUCTION_CANARY_ENABLED)).toLowerCase() !== "true") {
    return { enabled: false, reason: "kill_switch_off" };
  }

  const targetProviderId = normalized(readEnvironment(VOICE_PRODUCTION_CANARY_PROVIDER_ID));
  const targetAgentId = normalized(readEnvironment(VOICE_PRODUCTION_CANARY_AGENT_ID));
  if (!targetProviderId || !targetAgentId) return { enabled: false, reason: "target_incomplete" };
  if (normalized(providerId) !== targetProviderId) return { enabled: false, reason: "provider_mismatch" };
  if (normalized(agentId) !== targetAgentId) return { enabled: false, reason: "agent_mismatch" };
  return { enabled: true, reason: "enabled" };
}

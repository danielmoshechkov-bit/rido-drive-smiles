export interface VoiceLlmRoute {
  providerId: string;
  personaKey: string;
}

/** Supports both the legacy query-string URL and the ElevenLabs OpenAI-style path. */
export function resolveVoiceLlmRoute(url: URL): VoiceLlmRoute {
  const parts = url.pathname.split("/").filter(Boolean);
  const functionIndex = parts.indexOf("voice-agent-llm");
  const suffix = functionIndex >= 0 ? parts.slice(functionIndex + 3).join("/") : "";
  const hasConversationPath = suffix === "llm/chat/completions";
  const pathProviderId = hasConversationPath ? parts[functionIndex + 1] || "" : "";
  const pathPersonaKey = hasConversationPath ? parts[functionIndex + 2] || "" : "";

  return {
    providerId: url.searchParams.get("provider_id") || pathProviderId,
    personaKey: url.searchParams.get("persona_key") || pathPersonaKey || "workshop_secretary",
  };
}

import type { VoiceRoutingResponse } from "@/hooks/useVoiceAiRouting";

export const VOICE_AI_LOCAL_PREVIEW_PATH = "/dev/voice-ai-routing-preview";

export const voiceAiRoutingPreviewData: VoiceRoutingResponse = {
  success: true,
  routing: {
    id: "preview-voice-agent",
    function_key: "voice_agent",
    function_name: "Obsługa rozmów telefonicznych",
    function_description: "Globalny model sterujący rozmową i narzędziami agenta głosowego.",
    category: "Głos",
    provider_key: "claude_sonnet",
    model_override: "claude-sonnet-4-6",
    backup_provider_key: "openai",
    backup_model_override: "gpt-4o",
    allow_fallback: true,
    is_enabled: true,
    model_timeout_ms: 12_000,
    max_tool_rounds: 3,
    max_output_tokens: 320,
    updated_at: "2026-08-02T10:00:00.000Z",
  },
  providers: [
    {
      provider_key: "claude_sonnet",
      display_name: "Anthropic — Claude Sonnet",
      default_model: "claude-sonnet-4-6",
      timeout_seconds: 15,
      key_configured: true,
      adapter_key: "anthropic_messages",
    },
    {
      provider_key: "claude_haiku",
      display_name: "Anthropic — Claude Haiku",
      default_model: "claude-haiku-4-5-20251001",
      timeout_seconds: 10,
      key_configured: true,
      adapter_key: "anthropic_messages",
    },
    {
      provider_key: "openai",
      display_name: "OpenAI — GPT-4o",
      default_model: "gpt-4o",
      timeout_seconds: 15,
      key_configured: true,
      adapter_key: "openai_chat_completions",
    },
    {
      provider_key: "openai_mini",
      display_name: "OpenAI — GPT-4o mini",
      default_model: "gpt-4o-mini",
      timeout_seconds: 10,
      key_configured: false,
      adapter_key: "openai_chat_completions",
    },
  ],
  analysis_model: "claude-haiku-4-5-20251001",
};

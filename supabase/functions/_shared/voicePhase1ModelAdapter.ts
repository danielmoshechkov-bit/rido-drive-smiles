import { consumeAnthropicSse } from "./anthropicSse.ts";
import type { Phase1VoiceModelCandidate } from "./voicePhase1Runtime.ts";

export interface Phase1ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Phase1ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type Phase1ConversationMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant_tools"; content: string; calls: Phase1ToolCall[] }
  | { role: "tool_results"; results: Array<{ toolCallId: string; content: string }> };

const toAnthropicMessages = (messages: Phase1ConversationMessage[]) => messages.map((message) => {
  if (message.role === "assistant_tools") {
    return {
      role: "assistant",
      content: [
        ...(message.content ? [{ type: "text", text: message.content }] : []),
        ...message.calls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.input })),
      ],
    };
  }
  if (message.role === "tool_results") {
    return {
      role: "user",
      content: message.results.map((result) => ({
        type: "tool_result",
        tool_use_id: result.toolCallId,
        content: result.content,
      })),
    };
  }
  return message;
});

export const buildPhase1AnthropicRequest = (
  candidate: Phase1VoiceModelCandidate,
  apiKey: string,
  system: string,
  messages: Phase1ConversationMessage[],
  tools: Phase1ToolDefinition[],
  maxOutputTokens: number,
): { url: string; init: RequestInit } => ({
  url: candidate.endpoint,
  init: {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: candidate.model,
      max_tokens: maxOutputTokens,
      temperature: 0.5,
      system,
      messages: toAnthropicMessages(messages),
      stream: true,
      ...(tools.length ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(candidate.timeoutMs),
  },
});

export const consumePhase1AnthropicSse = async (
  response: Response,
  onText: (delta: string) => void,
) => {
  const result = await consumeAnthropicSse(response, onText);
  return {
    text: result.blocks.filter((block) => block.type === "text").map((block) => block.text || "").join(""),
    toolCalls: result.blocks.filter((block) => block.type === "tool_use").map((block) => ({
      id: block.id || "",
      name: block.name || "",
      input: block.input || {},
    })),
    stopReason: result.stopReason,
  };
};

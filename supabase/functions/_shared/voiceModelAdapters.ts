import { consumeAnthropicSse, type AnthropicStreamResult } from "./anthropicSse.ts";
import type { VoiceModelCandidate } from "./voiceAiRouting.ts";

export interface VoiceToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface VoiceToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface VoiceToolResult {
  toolCallId: string;
  content: string;
}

export type VoiceConversationMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant_tools"; content: string; calls: VoiceToolCall[] }
  | { role: "tool_results"; results: VoiceToolResult[] };

export interface VoiceStreamResult {
  text: string;
  toolCalls: VoiceToolCall[];
  stopReason: string | null;
}

export interface VoiceModelRequest {
  url: string;
  init: RequestInit;
}

const anthropicMessages = (messages: VoiceConversationMessage[]) => messages.map((message) => {
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

const openAiMessages = (system: string, messages: VoiceConversationMessage[]) => [
  { role: "system", content: system },
  ...messages.flatMap((message) => {
    if (message.role === "assistant_tools") {
      return [{
        role: "assistant",
        content: message.content || null,
        tool_calls: message.calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      }];
    }
    if (message.role === "tool_results") {
      return message.results.map((result) => ({ role: "tool", tool_call_id: result.toolCallId, content: result.content }));
    }
    return [message];
  }),
];

export function buildVoiceModelRequest(
  candidate: VoiceModelCandidate,
  apiKey: string,
  system: string,
  messages: VoiceConversationMessage[],
  tools: VoiceToolDefinition[],
  maxOutputTokens: number,
): VoiceModelRequest {
  if (candidate.adapterKey === "anthropic_messages") {
    return {
      url: candidate.endpoint,
      init: {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: candidate.model,
          max_tokens: maxOutputTokens,
          temperature: 0.5,
          system,
          messages: anthropicMessages(messages),
          stream: true,
          ...(tools.length ? { tools } : {}),
        }),
        signal: AbortSignal.timeout(candidate.timeoutMs),
      },
    };
  }

  if (candidate.adapterKey === "openai_chat_completions") {
    return {
      url: candidate.endpoint,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: candidate.model,
          max_tokens: maxOutputTokens,
          temperature: 0.5,
          messages: openAiMessages(system, messages),
          stream: true,
          ...(tools.length ? {
            tools: tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
            })),
            tool_choice: "auto",
          } : {}),
        }),
        signal: AbortSignal.timeout(candidate.timeoutMs),
      },
    };
  }

  throw new Error("VOICE_ADAPTER_NOT_IMPLEMENTED");
}

export async function consumeOpenAiChatSse(
  response: Response,
  onText: (delta: string) => void,
): Promise<VoiceStreamResult> {
  if (!response.body) throw new Error("OpenAI zwrócił pusty strumień");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let stopReason: string | null = null;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  const processData = (raw: string) => {
    if (!raw || raw === "[DONE]") return;
    let event: { choices?: Array<{ delta?: Record<string, unknown>; finish_reason?: string | null }> };
    try { event = JSON.parse(raw); } catch (_) { return; }
    const choice = event.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) stopReason = choice.finish_reason;
    const delta = choice.delta || {};
    if (typeof delta.content === "string" && delta.content) {
      text += delta.content;
      onText(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const fragment of delta.tool_calls as Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>) {
        const index = Number.isInteger(fragment.index) ? fragment.index! : 0;
        const current = calls.get(index) || { id: "", name: "", arguments: "" };
        current.id += fragment.id || "";
        current.name += fragment.function?.name || "";
        current.arguments += fragment.function?.arguments || "";
        calls.set(index, current);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      const data = event.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      processData(data);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const data = buffer.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    processData(data);
  }

  return {
    text,
    stopReason,
    toolCalls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
      let input: Record<string, unknown> = {};
      try { input = call.arguments ? JSON.parse(call.arguments) : {}; } catch (_) { input = {}; }
      return { id: call.id, name: call.name, input };
    }),
  };
}

const normalizeAnthropicResult = (result: AnthropicStreamResult): VoiceStreamResult => ({
  text: result.blocks.filter((block) => block.type === "text").map((block) => block.text || "").join(""),
  toolCalls: result.blocks.filter((block) => block.type === "tool_use").map((block) => ({
    id: block.id || "",
    name: block.name || "",
    input: block.input || {},
  })),
  stopReason: result.stopReason,
});

export async function consumeVoiceModelSse(
  candidate: VoiceModelCandidate,
  response: Response,
  onText: (delta: string) => void,
): Promise<VoiceStreamResult> {
  if (candidate.adapterKey === "anthropic_messages") {
    return normalizeAnthropicResult(await consumeAnthropicSse(response, onText));
  }
  if (candidate.adapterKey === "openai_chat_completions") return consumeOpenAiChatSse(response, onText);
  throw new Error("VOICE_ADAPTER_NOT_IMPLEMENTED");
}

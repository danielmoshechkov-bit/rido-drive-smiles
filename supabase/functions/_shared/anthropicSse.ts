export interface AnthropicContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface AnthropicStreamResult {
  blocks: AnthropicContentBlock[];
  stopReason: string | null;
  // Trafienia prompt cachingu. Bez tego nie da się sprawdzić, czy cache w ogóle
  // działa: ElevenLabs raportuje w llm_usage tylko to, co sami mu zgłosimy,
  // więc jego input_cache_read jest zawsze zerem niezależnie od stanu faktycznego.
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number } | null;
}

interface AnthropicStreamEvent {
  type?: string;
  index?: number;
  content_block?: {
    type?: string;
    text?: unknown;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  delta?: {
    type?: string;
    text?: unknown;
    partial_json?: string;
    stop_reason?: string;
  };
  // Anthropic podaje tokeny WYJSCIA dopiero tutaj, w message_delta na koncu
  // strumienia — message_start ma tylko 1-2.
  usage?: { output_tokens?: number };
  message?: {
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
}

export async function consumeAnthropicSse(
  response: Response,
  onText: (delta: string) => void,
): Promise<AnthropicStreamResult> {
  if (!response.body) throw new Error("Anthropic zwrócił pusty strumień");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason: string | null = null;
  let usage: AnthropicStreamResult["usage"] = null;
  const blocks = new Map<number, AnthropicContentBlock & { partialJson?: string }>();

  const processData = (raw: string) => {
    if (!raw || raw === "[DONE]") return;
    let event: AnthropicStreamEvent;
    try { event = JSON.parse(raw) as AnthropicStreamEvent; } catch (_) { return; }
    if (event.type === "content_block_start") {
      if (typeof event.index !== "number") return;
      const block = event.content_block || {};
      if (block.type === "text") {
        const text = typeof block.text === "string" ? block.text : "";
        blocks.set(event.index, { type: "text", text });
        if (text) onText(text);
      } else if (block.type === "tool_use") {
        blocks.set(event.index, {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input || {},
          partialJson: "",
        });
      }
      return;
    }
    if (event.type === "content_block_delta") {
      if (typeof event.index !== "number") return;
      const block = blocks.get(event.index);
      if (!block) return;
      if (event.delta?.type === "text_delta" && block.type === "text") {
        const text = typeof event.delta.text === "string" ? event.delta.text : "";
        block.text = (block.text || "") + text;
        if (text) onText(text);
      } else if (event.delta?.type === "input_json_delta" && block.type === "tool_use") {
        block.partialJson = (block.partialJson || "") + (event.delta.partial_json || "");
      }
      return;
    }
    if (event.type === "content_block_stop") {
      if (typeof event.index !== "number") return;
      const block = blocks.get(event.index);
      if (block?.type === "tool_use" && block.partialJson) {
        try { block.input = JSON.parse(block.partialJson); } catch (_) { block.input = {}; }
      }
      return;
    }
    if (event.type === "message_start" && event.message?.usage) {
      const u = event.message.usage;
      usage = {
        input: u.input_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0,
        cacheWrite: u.cache_creation_input_tokens || 0,
        // Na starcie wiadomosci jest zwykle 1-2; prawdziwa liczba przychodzi
        // w message_delta na koncu strumienia i nadpisuje ta.
        output: u.output_tokens || 0,
      };
      return;
    }
    if (event.type === "message_delta") {
      if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      // TOKENY WYJSCIA. Bez nich rachunek da sie tylko ZAKRESIC — 16.08
      // musialem podac „miedzy 23 a 28 USD" zamiast liczby, bo logowalismy
      // wylacznie wejscie.
      if (event.usage?.output_tokens != null && usage) usage.output = event.usage.output_tokens;
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
    blocks: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => {
      const { partialJson: _, ...clean } = block;
      return clean;
    }),
    stopReason,
    usage,
  };
}

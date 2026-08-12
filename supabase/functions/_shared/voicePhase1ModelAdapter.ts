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

// PROMPT CACHING.
//
// Prompt systemowy ma ~2650 tokenów i dotąd był przeliczany od zera w KAŻDEJ turze
// (`input_cache_read: 0` w raporcie ElevenLabs). To główne źródło ogonów opóźnień —
// w rozmowie 05.08 18:43 jedna tura czekała 6322 ms na pierwszy token przy pytaniu
// "Imię i nazwisko?", bez żadnego narzędzia.
//
// `system` (persona, kontekst firmy, baza wiedzy, wszystkie reguły) dostaje
// `cache_control: ephemeral`. `systemVolatile` (kontekst czasu, zmienny co minutę)
// idzie ZA nim, poza cache — prefiks musi być bajtowo identyczny, żeby trafić.
// Przy pustej części zmiennej wysyłamy jeden blok, czyli zachowanie jak dotąd.
export const buildPhase1AnthropicRequest = (
  candidate: Phase1VoiceModelCandidate,
  apiKey: string,
  system: string,
  messages: Phase1ConversationMessage[],
  tools: Phase1ToolDefinition[],
  maxOutputTokens: number,
  systemVolatile = "",
): { url: string; init: RequestInit } => ({
  url: candidate.endpoint,
  init: {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: candidate.model,
      max_tokens: maxOutputTokens,
      // TEMPERATURA 0 — dekodowanie zachłanne, odpowiedź powtarzalna.
      //
      // ElevenLabs wystrzeliwuje tę samą turę wielokrotnie (zmierzone: 22 żądania
      // na 10 tur, jedna tura z czterema) i SKLEJA odpowiedzi w jedną wiadomość:
      //   "Do zobaczenia w czwartek o dziesiątej. Dziękuję!Dobrze rozumiem. "
      // Przy 0.5 każdy duplikat brzmiał inaczej i klient słyszał plątaninę.
      // Przy 0 dwa identyczne żądania dają (prawie) identyczny tekst, więc nawet
      // bez cache'u sklejenie daje powtórzone zdanie, nie mieszaninę.
      //
      // Kreatywność nie jest tu potrzebna: agent zbiera dane i czyta ze snapshotu.
      // Ton budujemy promptem, nie losowością. Zysk uboczny: ta sama rozmowa daje
      // tę samą odpowiedź, więc regresje widać od razu.
      temperature: 0,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ...(systemVolatile ? [{ type: "text", text: systemVolatile }] : []),
      ],
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
    usage: result.usage,
  };
};

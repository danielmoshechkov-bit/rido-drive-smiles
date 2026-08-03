import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVoiceModelRequest,
  consumeOpenAiChatSse,
  type VoiceConversationMessage,
  type VoiceToolDefinition,
} from "./voiceModelAdapters.ts";
import type { VoiceModelCandidate } from "./voiceAiRouting.ts";

const openAiCandidate: VoiceModelCandidate = {
  providerKey: "openai",
  providerName: "OpenAI",
  model: "gpt-4o",
  timeoutMs: 5_000,
  adapterKey: "openai_chat_completions",
  secretKey: "OPENAI_API_KEY",
  endpoint: "https://api.openai.com/v1/chat/completions",
};

const tools: VoiceToolDefinition[] = [{
  name: "create_order",
  description: "Utwórz zlecenie",
  input_schema: { type: "object", properties: { complaint: { type: "string" } }, required: ["complaint"] },
}];

test("adapter OpenAI buduje streaming z narzędziami, timeoutem i bez ujawnienia klucza w body", () => {
  const messages: VoiceConversationMessage[] = [
    { role: "user", content: "Umów wizytę" },
    { role: "assistant_tools", content: "Już sprawdzam.", calls: [{ id: "call_1", name: "create_order", input: { complaint: "stuki" } }] },
    { role: "tool_results", results: [{ toolCallId: "call_1", content: '{"ok":true}' }] },
  ];
  const request = buildVoiceModelRequest(openAiCandidate, "test-secret", "System", messages, tools, 320);
  const body = JSON.parse(String(request.init.body));
  assert.equal(request.url, openAiCandidate.endpoint);
  assert.equal((request.init.headers as Record<string, string>).Authorization, "Bearer test-secret");
  assert.equal(body.stream, true);
  assert.equal(body.tools[0].function.name, "create_order");
  assert.equal(body.messages[2].tool_calls[0].id, "call_1");
  assert.equal(body.messages[3].role, "tool");
  assert.doesNotMatch(JSON.stringify(body), /test-secret/);
  assert.ok(request.init.signal instanceof AbortSignal);
});

test("parser OpenAI emituje tekst raz i składa fragmenty wywołania narzędzia", async () => {
  const frames = [
    { choices: [{ delta: { content: "Już " }, finish_reason: null }] },
    { choices: [{ delta: { content: "sprawdzam." }, finish_reason: null }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "create_", arguments: '{"compl' } }] }, finish_reason: null }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "order", arguments: 'aint":"stuki"}' } }] }, finish_reason: "tool_calls" }] },
  ];
  const response = new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  });
  const emitted: string[] = [];
  const result = await consumeOpenAiChatSse(response, (delta) => emitted.push(delta));
  assert.deepEqual(emitted, ["Już ", "sprawdzam."]);
  assert.equal(result.text, "Już sprawdzam.");
  assert.equal(result.stopReason, "tool_calls");
  assert.deepEqual(result.toolCalls, [{ id: "call_1", name: "create_order", input: { complaint: "stuki" } }]);
});

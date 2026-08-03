import test from "node:test";
import assert from "node:assert/strict";
import { consumeAnthropicSse } from "./anthropicSse.ts";

test("strumień Anthropic przekazuje tekst przyrostowo i składa wywołanie narzędzia", async () => {
  const frames = [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "Już " } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "sprawdzam." } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool-1", name: "create_booking", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"scheduled_date":"2026-08-02"}' } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: "tool_use" } },
  ];
  const body = frames.map((frame) => `event: message\ndata: ${JSON.stringify(frame)}\n\n`).join("");
  const deltas: string[] = [];
  const result = await consumeAnthropicSse(new Response(body), (delta) => deltas.push(delta));
  assert.deepEqual(deltas, ["Już ", "sprawdzam."]);
  assert.equal(result.stopReason, "tool_use");
  assert.deepEqual(result.blocks[1], {
    type: "tool_use",
    id: "tool-1",
    name: "create_booking",
    input: { scheduled_date: "2026-08-02" },
  });
});

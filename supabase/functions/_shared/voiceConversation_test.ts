import test from "node:test";
import assert from "node:assert/strict";
import {
  canReplaceCallLinkWithBooking,
  extractConversationIdFromLlmRequest,
  linkOrderToVoiceConversation,
  normalizePhone,
  parseElevenLabsWebhook,
  persistVoiceConversation,
  type VoiceCallRecord,
  type VoiceConversationRepository,
  type VoiceMessage,
  type VoiceOrderRecord,
} from "./voiceConversation.ts";

test("adapter Custom LLM odczytuje conversation_id z bezpiecznego markera systemowego", () => {
  const id = extractConversationIdFromLlmRequest({
    messages: [{ role: "system", content: "GETRIDO_CONVERSATION_ID=conv_123456789" }],
  });
  assert.equal(id, "conv_123456789");
  assert.equal(extractConversationIdFromLlmRequest({ conversation_id: "../../invalid" }), null);
});

test("ponowienie rezerwacji nie degraduje relacji rozmowy ze zleceniem", () => {
  assert.equal(canReplaceCallLinkWithBooking("workshop_order"), false);
  assert.equal(canReplaceCallLinkWithBooking("service_booking"), true);
  assert.equal(canReplaceCallLinkWithBooking(null), true);
});

class MemoryRepository implements VoiceConversationRepository {
  calls = new Map<string, VoiceCallRecord & { phone: string | null }>();
  transcripts = new Map<string, { messages: VoiceMessage[]; fullText: string; summary: string | null }>();
  orders = new Map<string, VoiceOrderRecord & { bookingId: string | null; phone: string | null; conversationId: string | null }>();
  nextCall = 1;

  addOrder(id: string, providerId: string, phone: string | null, bookingId: string | null = null, conversationId: string | null = null) {
    this.orders.set(id, { id, providerId, phone, bookingId, conversationId });
  }

  async findOrder(providerId: string, refs: { conversationId: string; orderId: string | null; bookingId: string | null; phone: string | null }) {
    const candidates = [...this.orders.values()].filter((order) => order.providerId === providerId);
    return candidates.find((order) => order.conversationId === refs.conversationId)
      || candidates.find((order) => refs.orderId && order.id === refs.orderId)
      || candidates.find((order) => refs.bookingId && order.bookingId === refs.bookingId)
      || candidates.find((order) => normalizePhone(refs.phone) && normalizePhone(order.phone) === normalizePhone(refs.phone))
      || null;
  }

  async upsertCall(input: Parameters<VoiceConversationRepository["upsertCall"]>[0]) {
    const key = `${input.providerId}:${input.parsed.conversationId}`;
    const existing = this.calls.get(key);
    const row = existing || {
      id: `call-${this.nextCall++}`,
      providerId: input.providerId,
      conversationId: input.parsed.conversationId,
      linkedOrderId: null,
      phone: input.parsed.externalNumber,
    };
    if (input.linkedOrderId) row.linkedOrderId = input.linkedOrderId;
    row.phone = input.parsed.externalNumber;
    this.calls.set(key, row);
    return row;
  }

  async upsertTranscript(input: Parameters<VoiceConversationRepository["upsertTranscript"]>[0]) {
    this.transcripts.set(input.callId, {
      messages: input.messages,
      fullText: input.fullText,
      summary: input.summary,
    });
  }

  async findCallByConversation(providerId: string, conversationId: string) {
    return this.calls.get(`${providerId}:${conversationId}`) || null;
  }

  async findRecentUnlinkedCallByPhone(providerId: string, phone: string) {
    return [...this.calls.values()].find((call) =>
      call.providerId === providerId && !call.linkedOrderId && normalizePhone(call.phone) === normalizePhone(phone)
    ) || null;
  }

  async orderBelongsToProvider(providerId: string, orderId: string) {
    return this.orders.get(orderId)?.providerId === providerId;
  }

  async linkCallToOrder(providerId: string, callId: string, orderId: string) {
    const call = [...this.calls.values()].find((candidate) => candidate.id === callId && candidate.providerId === providerId);
    if (!call || !(await this.orderBelongsToProvider(providerId, orderId))) return false;
    call.linkedOrderId = orderId;
    return true;
  }
}

const webhook = (overrides: Record<string, unknown> = {}) => ({
  type: "post_call_transcription",
  data: {
    agent_id: "agent-test",
    conversation_id: "conv-test-1",
    status: "done",
    transcript: [
      { role: "agent", message: "Dzień dobry", time_in_call_secs: 0 },
      { role: "user", message: "Proszę umówić wizytę", time_in_call_secs: 2 },
    ],
    metadata: {
      start_time_unix_secs: 1_750_000_000,
      call_duration_secs: 30,
      phone_call: { direction: "inbound", external_number: "+48 500 600 700", agent_number: "+48 100 200 300" },
    },
    analysis: { transcript_summary: "- Klient poprosił o wizytę", call_successful: "success", data_collection_results: {} },
    conversation_initiation_client_data: { dynamic_variables: {}, custom_llm_extra_body: {} },
    ...overrides,
  },
});

test("webhook przed zleceniem: późniejsze zlecenie dopina wcześniej zapisaną rozmowę", async () => {
  const repo = new MemoryRepository();
  const parsed = parseElevenLabsWebhook(webhook());
  const stored = await persistVoiceConversation(repo, { providerId: "company-a", personaKey: "workshop_secretary", parsed });
  assert.equal(stored.orderId, null);
  repo.addOrder("order-a", "company-a", "+48500600700", null, "conv-test-1");
  const linked = await linkOrderToVoiceConversation(repo, {
    providerId: "company-a", orderId: "order-a", conversationId: "conv-test-1",
  });
  assert.deepEqual(linked, { linked: true, callId: stored.callId });
  assert.equal(repo.calls.get("company-a:conv-test-1")?.linkedOrderId, "order-a");
});

test("webhook po zleceniu: rozmowa od razu otrzymuje relację z właściwym zleceniem", async () => {
  const repo = new MemoryRepository();
  repo.addOrder("order-a", "company-a", "+48500600700", null, "conv-test-1");
  const stored = await persistVoiceConversation(repo, {
    providerId: "company-a",
    personaKey: "workshop_secretary",
    parsed: parseElevenLabsWebhook(webhook()),
  });
  assert.equal(stored.orderId, "order-a");
  assert.equal(repo.calls.get("company-a:conv-test-1")?.linkedOrderId, "order-a");
});

test("ponowne dostarczenie webhooka jest idempotentne", async () => {
  const repo = new MemoryRepository();
  const parsed = parseElevenLabsWebhook(webhook());
  const first = await persistVoiceConversation(repo, { providerId: "company-a", personaKey: "workshop_secretary", parsed });
  const second = await persistVoiceConversation(repo, { providerId: "company-a", personaKey: "workshop_secretary", parsed });
  assert.equal(first.callId, second.callId);
  assert.equal(repo.calls.size, 1);
  assert.equal(repo.transcripts.size, 1);
});

test("brak podsumowania nie blokuje zapisu pełnej transkrypcji", async () => {
  const repo = new MemoryRepository();
  const payload = webhook({ analysis: { transcript_summary: null, data_collection_results: {} } });
  const parsed = parseElevenLabsWebhook(payload);
  const stored = await persistVoiceConversation(repo, { providerId: "company-a", personaKey: "workshop_secretary", parsed });
  const transcript = repo.transcripts.get(stored.callId);
  assert.equal(transcript?.summary, null);
  assert.equal(transcript?.messages.length, 2);
  assert.match(transcript?.fullText || "", /KLIENT: Proszę umówić wizytę/);
});

test("rozmowa i zlecenie różnych firm nie mogą zostać powiązane", async () => {
  const repo = new MemoryRepository();
  repo.addOrder("order-b", "company-b", "+48500600700");
  const payload = webhook({
    conversation_initiation_client_data: { dynamic_variables: { order_id: "order-b" }, custom_llm_extra_body: {} },
  });
  const stored = await persistVoiceConversation(repo, {
    providerId: "company-a",
    personaKey: "workshop_secretary",
    parsed: parseElevenLabsWebhook(payload),
  });
  assert.equal(stored.orderId, null);
  const linked = await linkOrderToVoiceConversation(repo, { providerId: "company-a", orderId: "order-b", conversationId: "conv-test-1" });
  assert.deepEqual(linked, { linked: false, callId: null });
  assert.equal(repo.calls.get("company-a:conv-test-1")?.linkedOrderId, null);
});

export interface VoiceMessage {
  role: "assistant" | "user";
  content: string;
  time_in_call_secs?: number;
}

export interface ParsedVoiceConversation {
  eventType: string;
  agentId: string | null;
  conversationId: string;
  messages: VoiceMessage[];
  fullText: string;
  summary: string | null;
  outcome: string | null;
  orderId: string | null;
  bookingId: string | null;
  externalNumber: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  callSid: string | null;
  direction: "inbound" | "outbound";
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  language: string | null;
}

export interface VoiceCallRecord {
  id: string;
  providerId: string;
  conversationId: string;
  linkedOrderId: string | null;
}

export interface VoiceOrderRecord {
  id: string;
  providerId: string;
}

export interface VoiceConversationRepository {
  findOrder(
    providerId: string,
    refs: { conversationId: string; orderId: string | null; bookingId: string | null; phone: string | null },
  ): Promise<VoiceOrderRecord | null>;
  upsertCall(input: {
    providerId: string;
    personaKey: string;
    parsed: ParsedVoiceConversation;
    linkedOrderId: string | null;
  }): Promise<VoiceCallRecord>;
  upsertTranscript(input: {
    callId: string;
    providerId: string;
    messages: VoiceMessage[];
    fullText: string;
    summary: string | null;
  }): Promise<void>;
  findCallByConversation(providerId: string, conversationId: string): Promise<VoiceCallRecord | null>;
  findRecentUnlinkedCallByPhone(providerId: string, phone: string): Promise<VoiceCallRecord | null>;
  orderBelongsToProvider(providerId: string, orderId: string): Promise<boolean>;
  linkCallToOrder(providerId: string, callId: string, orderId: string): Promise<boolean>;
}

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const asPositiveNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

const unwrapCollectedValue = (value: unknown): unknown => {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return row.value ?? row.result ?? row.extracted_value ?? value;
  }
  return value;
};

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const result = asString(unwrapCollectedValue(value));
    if (result) return result;
  }
  return null;
};

const validConversationId = (value: string | null): string | null =>
  value && /^[A-Za-z0-9_-]{6,255}$/.test(value) ? value : null;

const toIso = (unixSeconds: unknown): string | null => {
  const value = Number(unixSeconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
};

export const normalizePhone = (phone: string | null | undefined): string =>
  (phone || "").replace(/\D/g, "").slice(-9);

export const canReplaceCallLinkWithBooking = (linkedEntityType: string | null | undefined): boolean =>
  linkedEntityType !== "workshop_order";

export function parseElevenLabsWebhook(payload: unknown): ParsedVoiceConversation {
  const root = payload && typeof payload === "object" ? payload as Record<string, any> : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const eventType = asString(root.type) || "unknown";
  const conversationId = firstString(data.conversation_id, root.conversation_id) || "";
  const rawTranscript = Array.isArray(data.transcript)
    ? data.transcript
    : Array.isArray(root.transcript)
    ? root.transcript
    : [];
  const messages: VoiceMessage[] = rawTranscript.flatMap((turn: any) => {
    const content = firstString(turn?.message, turn?.text, turn?.content);
    if (!content) return [];
    const role = turn?.role === "agent" || turn?.role === "assistant" ? "assistant" : "user";
    const time = Number(turn?.time_in_call_secs);
    return [{
      role,
      content,
      ...(Number.isFinite(time) && time >= 0 ? { time_in_call_secs: time } : {}),
    } as VoiceMessage];
  });
  const fullText = messages
    .map((message) => `${message.role === "assistant" ? "AGENT" : "KLIENT"}: ${message.content}`)
    .join("\n");

  const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {};
  const collected = analysis.data_collection_results && typeof analysis.data_collection_results === "object"
    ? analysis.data_collection_results
    : {};
  const initiation = data.conversation_initiation_client_data && typeof data.conversation_initiation_client_data === "object"
    ? data.conversation_initiation_client_data
    : {};
  const dynamic = initiation.dynamic_variables && typeof initiation.dynamic_variables === "object"
    ? initiation.dynamic_variables
    : {};
  const extra = initiation.custom_llm_extra_body && typeof initiation.custom_llm_extra_body === "object"
    ? initiation.custom_llm_extra_body
    : {};
  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  const phoneCall = metadata.phone_call && typeof metadata.phone_call === "object" ? metadata.phone_call : {};
  const direction = phoneCall.direction === "outbound" ? "outbound" : "inbound";
  const externalNumber = firstString(phoneCall.external_number, dynamic.system__caller_id);
  const agentNumber = firstString(phoneCall.agent_number, dynamic.system__called_number);
  const durationSeconds = asPositiveNumber(metadata.call_duration_secs);
  const startedAt = toIso(metadata.start_time_unix_secs);
  const endedAt = startedAt && durationSeconds
    ? new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString()
    : null;

  return {
    eventType,
    agentId: firstString(data.agent_id),
    conversationId,
    messages,
    fullText,
    summary: firstString(analysis.transcript_summary, analysis.summary, data.summary),
    outcome: firstString(analysis.call_successful, analysis.outcome),
    orderId: firstString(
      dynamic.workshop_order_id,
      dynamic.order_id,
      extra.workshop_order_id,
      extra.order_id,
      collected.workshop_order_id,
      collected.order_id,
    ),
    bookingId: firstString(
      dynamic.booking_id,
      dynamic.service_booking_id,
      extra.booking_id,
      extra.service_booking_id,
      collected.booking_id,
      collected.service_booking_id,
    ),
    externalNumber,
    fromNumber: direction === "inbound" ? externalNumber : agentNumber,
    toNumber: direction === "inbound" ? agentNumber : externalNumber,
    callSid: firstString(phoneCall.call_sid, dynamic.system__call_sid),
    direction,
    durationSeconds,
    startedAt,
    endedAt,
    language: firstString(metadata.main_language),
  };
}

export function extractConversationIdFromLlmRequest(
  body: Record<string, any>,
  queryConversationId?: string | null,
): string | null {
  const extra = body?.elevenlabs_extra_body && typeof body.elevenlabs_extra_body === "object"
    ? body.elevenlabs_extra_body
    : {};
  const direct = validConversationId(firstString(
    queryConversationId,
    extra.conversation_id,
    extra.elevenlabs_conversation_id,
    body?.conversation_id,
  ));
  if (direct) return direct;

  const systemText = (Array.isArray(body?.messages) ? body.messages : [])
    .filter((message: any) => message?.role === "system" && typeof message?.content === "string")
    .map((message: any) => message.content)
    .join("\n");
  const marker = systemText.match(/GETRIDO_CONVERSATION_ID\s*[:=]\s*([A-Za-z0-9_-]{6,255})/i);
  return validConversationId(marker?.[1] || null);
}

export async function persistVoiceConversation(
  repo: VoiceConversationRepository,
  input: { providerId: string; personaKey: string; parsed: ParsedVoiceConversation },
): Promise<{ callId: string; orderId: string | null }> {
  if (!input.providerId) throw new Error("Brak provider_id");
  if (!input.parsed.conversationId) throw new Error("Brak conversation_id");
  if (input.parsed.messages.length === 0) throw new Error("Brak transkrypcji");

  const order = await repo.findOrder(input.providerId, {
    conversationId: input.parsed.conversationId,
    orderId: input.parsed.orderId,
    bookingId: input.parsed.bookingId,
    phone: input.parsed.externalNumber,
  });
  const call = await repo.upsertCall({
    providerId: input.providerId,
    personaKey: input.personaKey,
    parsed: input.parsed,
    linkedOrderId: order?.id || null,
  });
  await repo.upsertTranscript({
    callId: call.id,
    providerId: input.providerId,
    messages: input.parsed.messages,
    fullText: input.parsed.fullText,
    summary: input.parsed.summary,
  });
  if (order && call.linkedOrderId !== order.id) {
    await repo.linkCallToOrder(input.providerId, call.id, order.id);
  }
  return { callId: call.id, orderId: order?.id || call.linkedOrderId || null };
}

export async function linkOrderToVoiceConversation(
  repo: VoiceConversationRepository,
  input: { providerId: string; orderId: string; conversationId?: string | null; phone?: string | null },
): Promise<{ linked: boolean; callId: string | null }> {
  if (!(await repo.orderBelongsToProvider(input.providerId, input.orderId))) {
    return { linked: false, callId: null };
  }
  const call = input.conversationId
    ? await repo.findCallByConversation(input.providerId, input.conversationId)
    : input.phone
    ? await repo.findRecentUnlinkedCallByPhone(input.providerId, input.phone)
    : null;
  if (!call) return { linked: false, callId: null };
  const linked = await repo.linkCallToOrder(input.providerId, call.id, input.orderId);
  return { linked, callId: linked ? call.id : null };
}

import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireUser,
  SecurityError,
  writeAuditEvent,
  type RequestIdentity,
} from "../_shared/security.ts";
import {
  assertPaymentRequestOrigin,
  parsePaymentInitInput,
  readSmallJsonBody,
  type PaymentInitInput,
} from "../_shared/paymentSecurity.ts";
import { isUuid } from "../_shared/securityPrimitives.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

interface GatewayConfiguration {
  id: string;
  provider: "przelewy24";
  isTestMode: boolean;
}

interface PaymentOrder {
  paymentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  tenantId: string | null;
  idempotentReplay: boolean;
}

function requireSecretReference(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^P24_[A-Z0-9_]{3,60}$/.test(value)) {
    throw new SecurityError(503, "payment_gateway_not_configured", `Brak bezpiecznej konfiguracji ${field}`);
  }
  const secret = Deno.env.get(value);
  if (!secret || secret.length < 16 || secret !== secret.trim()) {
    throw new SecurityError(503, "payment_gateway_not_configured", `Brak bezpiecznej konfiguracji ${field}`);
  }
  return value;
}

async function requireGatewayConfiguration(client: ServiceClient): Promise<GatewayConfiguration> {
  const { data, error } = await client
    .from("payment_gateway_config")
    .select("id, provider, is_enabled, is_test_mode, merchant_id, api_key_secret_name, config_json")
    .eq("is_enabled", true)
    .limit(2);

  if (error || !data || data.length !== 1) {
    throw new SecurityError(503, "payment_gateway_not_configured", "Operator płatności nie jest bezpiecznie skonfigurowany");
  }

  const row = data[0] as {
    id?: unknown;
    provider?: unknown;
    is_test_mode?: unknown;
    merchant_id?: unknown;
    api_key_secret_name?: unknown;
    config_json?: unknown;
  };
  if (!isUuid(row.id) || row.provider !== "przelewy24") {
    throw new SecurityError(503, "payment_gateway_not_configured", "Operator płatności nie jest bezpiecznie skonfigurowany");
  }
  if (typeof row.merchant_id !== "string" || !/^[1-9][0-9]{0,11}$/.test(row.merchant_id)) {
    throw new SecurityError(503, "payment_gateway_not_configured", "Identyfikator operatora płatności jest nieprawidłowy");
  }

  const config = row.config_json && typeof row.config_json === "object" && !Array.isArray(row.config_json)
    ? row.config_json as Record<string, unknown>
    : {};
  requireSecretReference(row.api_key_secret_name, "klucza API");
  requireSecretReference(config.crc_secret_name, "klucza CRC");

  return {
    id: row.id,
    provider: "przelewy24",
    isTestMode: row.is_test_mode !== false,
  };
}

function requireIntentCreationEnabled(): void {
  if (Deno.env.get("PAYMENT_INTENT_CREATION_ENABLED") !== "true") {
    throw new SecurityError(
      503,
      "payment_intent_creation_disabled",
      "Tworzenie intencji płatniczych wymaga jawnej konfiguracji",
    );
  }
}

function normalizePaymentOrder(data: unknown): PaymentOrder {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || (Array.isArray(data) && data.length !== 1)) {
    throw new SecurityError(503, "payment_catalog_unavailable", "Nie można bezpiecznie ustalić ceny produktu");
  }

  const value = row as Record<string, unknown>;
  const amountMinor = typeof value.amount_minor === "number"
    ? value.amount_minor
    : Number(value.amount_minor);
  const paymentId = value.payment_id;
  const currency = value.currency;
  const description = value.description;
  const replay = value.idempotent_replay;
  let tenantId: string | null = null;
  if (value.tenant_id !== null && value.tenant_id !== undefined) {
    if (!isUuid(value.tenant_id)) {
      throw new SecurityError(503, "invalid_payment_catalog_result", "Katalog płatności zwrócił nieprawidłowe dane");
    }
    tenantId = value.tenant_id;
  }
  if (
    !isUuid(paymentId) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/.test(currency) ||
    typeof description !== "string" ||
    description.length < 1 ||
    description.length > 255 ||
    typeof replay !== "boolean"
  ) {
    throw new SecurityError(503, "invalid_payment_catalog_result", "Katalog płatności zwrócił nieprawidłowe dane");
  }

  return {
    paymentId,
    amountMinor,
    currency,
    description,
    tenantId,
    idempotentReplay: replay,
  };
}

async function createPaymentOrder(
  client: ServiceClient,
  identity: RequestIdentity,
  input: PaymentInitInput,
): Promise<PaymentOrder> {
  const { data, error } = await client.rpc("billing_create_payment_order", {
    p_actor_id: identity.userId,
    p_price_id: input.priceId,
    p_product_ref_id: input.productRefId,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: identity.correlationId,
  });

  if (error) {
    console.error("payment_order_rpc_failed", { code: error.code, correlation_id: identity.correlationId });
    if (error.code === "22023") {
      throw new SecurityError(400, "price_not_available", "Cena lub produkt nie są dostępne");
    }
    if (error.code === "23505") {
      throw new SecurityError(
        409,
        "idempotency_key_conflict",
        "Klucz idempotencji został już użyty dla innej płatności",
      );
    }
    if (error.code === "P0001") {
      throw new SecurityError(429, "payment_rate_limit_exceeded", "Przekroczono limit inicjowania płatności");
    }
    if (error.code === "42501") {
      throw new SecurityError(409, "payment_context_required", "Nie można jednoznacznie ustalić odbiorcy płatności");
    }
    throw new SecurityError(503, "payment_catalog_unavailable", "Nie można bezpiecznie utworzyć płatności");
  }
  return normalizePaymentOrder(data);
}

async function auditFailure(
  client: ServiceClient | null,
  identity: RequestIdentity | null,
  error: unknown,
): Promise<void> {
  if (!client || !identity) return;
  if (error instanceof SecurityError && error.code === "payment_intent_creation_disabled") {
    // Domyślnie wyłączony endpoint nie może służyć do nieograniczonego
    // generowania wpisów audytowych przez uwierzytelnionego klienta.
    return;
  }
  const denied = error instanceof SecurityError && error.status >= 400 && error.status < 500;
  await writeAuditEvent(client, {
    actorId: identity.userId,
    tenantId: identity.companyIds.length === 1 ? identity.companyIds[0] : null,
    action: "payment.intent.create",
    resourceType: "payment",
    result: denied ? "denied" : "failed",
    correlationId: identity.correlationId,
    metadata: { error_code: error instanceof SecurityError ? error.code : "internal_error" },
  });
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  let client: ServiceClient | null = null;
  let identity: RequestIdentity | null = null;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Obsługiwana jest wyłącznie metoda POST");
    }
    assertPaymentRequestOrigin(req);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") ?? "")) {
      throw new SecurityError(415, "unsupported_media_type", "Wymagany jest format application/json");
    }

    client = createServiceClient();
    identity = await requireUser(req, client);
    const input = parsePaymentInitInput(await readSmallJsonBody(req), req);
    requireIntentCreationEnabled();

    const gateway = await requireGatewayConfiguration(client);
    const order = await createPaymentOrder(client, identity, input);
    if (order.tenantId && !identity.isAdmin && !identity.companyIds.includes(order.tenantId)) {
      throw new SecurityError(403, "cross_tenant_denied", "Intencja płatności nie należy do użytkownika");
    }

    await writeAuditEvent(client, {
      actorId: identity.userId,
      tenantId: order.tenantId,
      action: "payment.intent.create",
      resourceType: "payment",
      resourceId: order.paymentId,
      result: "succeeded",
      correlationId: identity.correlationId,
      metadata: {
        price_id: input.priceId,
        amount_minor: order.amountMinor,
        currency: order.currency,
        gateway: gateway.provider,
        gateway_test_mode: gateway.isTestMode,
        gateway_registration: "blocked_pending_verified_adapter",
        idempotent_replay: order.idempotentReplay,
      },
    });

    return jsonResponse(req, 202, {
      payment_id: order.paymentId,
      amount_minor: order.amountMinor,
      currency: order.currency,
      status: "gateway_registration_blocked",
      payment_url: null,
      idempotent_replay: order.idempotentReplay,
    });
  } catch (error) {
    try {
      await auditFailure(client, identity, error);
    } catch (auditError) {
      return errorResponse(req, auditError);
    }
    return errorResponse(req, error);
  }
});

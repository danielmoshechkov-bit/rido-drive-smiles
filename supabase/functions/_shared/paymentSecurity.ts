import {
  isOriginAllowed,
  isUuid,
  parseAllowedOrigins,
  SecurityError,
} from "./securityPrimitives.ts";

const PAYMENT_BODY_KEYS = new Set(["action", "price_id", "product_ref_id"]);
const LEGACY_VALUE_KEYS = new Set([
  "user_id",
  "tenant_id",
  "company_id",
  "provider_id",
  "amount",
  "amount_minor",
  "currency",
  "credits",
  "credits_amount",
  "sms",
  "sms_amount",
  "metadata",
  "product_type",
  "description",
  "status",
  "paid",
  "wallet_used",
  "delivery_type",
  "delivery_address",
  "inpost_point_id",
  "return_url",
]);

export interface PaymentInitInput {
  priceId: string;
  productRefId: string | null;
  idempotencyKey: string;
}

function configuredOrigins(): Set<string> {
  return parseAllowedOrigins(
    Deno.env.get("ALLOWED_ORIGINS"),
    Deno.env.get("APP_PUBLIC_URL") ?? Deno.env.get("SITE_URL"),
  );
}

export function assertPaymentRequestOrigin(req: Request): void {
  const origin = req.headers.get("Origin");
  if (origin && !isOriginAllowed(origin, configuredOrigins())) {
    throw new SecurityError(403, "origin_not_allowed", "Origin żądania nie jest dozwolony");
  }
}

export function requirePaymentIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? "";
  if (!isUuid(key) || key !== value) {
    throw new SecurityError(
      400,
      "invalid_idempotency_key",
      "Nagłówek x-idempotency-key musi zawierać identyfikator UUID",
    );
  }
  return key;
}

export function parsePaymentInitInput(body: unknown, req: Request): PaymentInitInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SecurityError(400, "invalid_request", "Nieprawidłowe żądanie płatności");
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  const legacyKeys = keys.filter((key) => LEGACY_VALUE_KEYS.has(key));
  if (legacyKeys.length > 0) {
    throw new SecurityError(
      400,
      "legacy_payment_payload_rejected",
      "Klient płatności wymaga aktualizacji; wartości płatności są ustalane wyłącznie przez serwer",
    );
  }

  const unsupportedKeys = keys.filter((key) => !PAYMENT_BODY_KEYS.has(key));
  if (unsupportedKeys.length > 0) {
    throw new SecurityError(400, "unsupported_payment_fields", "Żądanie zawiera niedozwolone pola");
  }

  if (record.action !== "init") {
    if (["admin_grant", "confirm_webhook", "credits_check"].includes(String(record.action ?? ""))) {
      throw new SecurityError(410, "legacy_payment_action_disabled", "Ta operacja płatnicza została wyłączona");
    }
    throw new SecurityError(400, "unsupported_payment_action", "Obsługiwana jest wyłącznie inicjalizacja płatności");
  }

  if (
    typeof record.price_id !== "string" ||
    record.price_id.length < 1 ||
    record.price_id.length > 128 ||
    record.price_id !== record.price_id.trim() ||
    !/^[A-Za-z0-9._:-]+$/.test(record.price_id)
  ) {
    throw new SecurityError(400, "invalid_price_id", "Nieprawidłowy identyfikator ceny");
  }

  let productRefId: string | null = null;
  if (record.product_ref_id !== undefined && record.product_ref_id !== null) {
    if (!isUuid(record.product_ref_id)) {
      throw new SecurityError(400, "invalid_product_reference", "Nieprawidłowy identyfikator produktu");
    }
    throw new SecurityError(
      410,
      "product_reference_checkout_disabled",
      "Checkout produktu domenowego wymaga serwerowej migawki i kontroli właściciela",
    );
  }

  return {
    priceId: record.price_id,
    productRefId,
    idempotencyKey: requirePaymentIdempotencyKey(req.headers.get("x-idempotency-key")),
  };
}

export async function readSmallJsonBody(req: Request, maxBytes = 8192): Promise<unknown> {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new SecurityError(413, "payload_too_large", "Żądanie płatności jest zbyt duże");
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new SecurityError(413, "payload_too_large", "Żądanie płatności jest zbyt duże");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new SecurityError(400, "invalid_json", "Nieprawidłowy format żądania");
  }
}

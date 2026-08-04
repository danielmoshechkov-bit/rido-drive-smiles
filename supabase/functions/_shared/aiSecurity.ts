import {
  constantTimeEqual,
  isUuid,
  SecurityError,
} from "./securityPrimitives.ts";

export const AI_RISK_CLASSES = [
  "read_only",
  "write_low",
  "write_high",
  "financial",
  "legal",
  "destructive",
] as const;

export type AiRiskClass = (typeof AI_RISK_CLASSES)[number];
export type AiCallerKind = "user_jwt" | "internal_capability";

const AI_RISK_CLASS_SET = new Set<string>(AI_RISK_CLASSES);
const CAPABILITY_PREFIX = "rido-ai-v1";
const MAX_CAPABILITY_TTL_SECONDS = 300;
const MAX_CAPABILITY_PAYLOAD_LENGTH = 4096;
const PERSONA_PATTERN = /^[a-z0-9_-]{1,64}$/;
const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,99}$/;
const CALL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const VERIFIED_CAPABILITY = Symbol("verified-ai-capability");

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface AiCapabilityClaims {
  readonly v: 1;
  readonly provider_id: string;
  readonly config_id: string;
  readonly call_id: string;
  readonly persona_key: string;
  readonly scope: string;
  readonly iat: number;
  readonly exp: number;
  readonly nonce: string;
}

export type VerifiedAiCapabilityClaims = AiCapabilityClaims & {
  readonly [VERIFIED_CAPABILITY]: true;
};

export interface IssueAiCapabilityInput {
  providerId: string;
  configId: string;
  callId: string;
  personaKey: string;
  scope: string;
  nonce?: string;
  nowSeconds?: number;
  ttlSeconds?: number;
}

export interface AiCapabilityBinding {
  providerId: string;
  configId: string;
  callId: string;
  personaKey: string;
  scope: string;
}

export interface VerifyAiCapabilityOptions {
  binding: AiCapabilityBinding;
  nowSeconds?: number;
  maxClockSkewSeconds?: number;
  maxTtlSeconds?: number;
}

type RpcError = { code?: string; message?: string } | null;
type RateLimitRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError }>;
};

export interface AiRateLimitOptions {
  scope: string;
  subjectId: string;
  limit: number;
  windowSeconds: number;
}

function normalizedUuid(value: unknown, code: string, message: string): string {
  if (!isUuid(value)) throw new SecurityError(400, code, message);
  return value.toLowerCase();
}

function normalizedSafeValue(
  value: unknown,
  pattern: RegExp,
  code: string,
  message: string,
  lowercase = false,
): string {
  if (typeof value !== "string") {
    throw new SecurityError(400, code, message);
  }
  const normalized = lowercase ? value.toLowerCase() : value;
  if (!pattern.test(normalized)) throw new SecurityError(400, code, message);
  return normalized;
}

function normalizedEpochSeconds(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new SecurityError(400, code, "Nieprawidłowy czas capability");
  }
  return Number(value);
}

function normalizeSigningSecret(secret: string | Uint8Array): Uint8Array {
  const bytes = typeof secret === "string" ? textEncoder.encode(secret) : secret;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 32) {
    throw new SecurityError(503, "ai_capability_key_not_configured", "Klucz capability AI nie jest skonfigurowany");
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
  } catch {
    throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signCapabilityData(secret: string | Uint8Array, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    normalizeSigningSecret(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(data));
  return bytesToHex(new Uint8Array(signature));
}

function normalizeCapabilityBinding(binding: AiCapabilityBinding): AiCapabilityBinding {
  return {
    providerId: normalizedUuid(binding.providerId, "invalid_provider", "Nieprawidłowy usługodawca"),
    configId: normalizedUuid(binding.configId, "invalid_agent_config", "Nieprawidłowa konfiguracja agenta"),
    callId: normalizedSafeValue(binding.callId, CALL_ID_PATTERN, "invalid_call", "Nieprawidłowa rozmowa"),
    personaKey: normalizedSafeValue(binding.personaKey, PERSONA_PATTERN, "invalid_persona", "Nieprawidłowa persona", true),
    scope: normalizedSafeValue(binding.scope, SCOPE_PATTERN, "invalid_ai_scope", "Nieprawidłowy zakres capability AI", true),
  };
}

function normalizeCapabilityClaims(value: unknown): AiCapabilityClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
  }
  const claims = value as Record<string, unknown>;
  if (claims.v !== 1) {
    throw new SecurityError(401, "unsupported_ai_capability", "Nieobsługiwana wersja capability AI");
  }
  return {
    v: 1,
    provider_id: normalizedUuid(claims.provider_id, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI"),
    config_id: normalizedUuid(claims.config_id, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI"),
    call_id: normalizedSafeValue(claims.call_id, CALL_ID_PATTERN, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI"),
    persona_key: normalizedSafeValue(claims.persona_key, PERSONA_PATTERN, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI", true),
    scope: normalizedSafeValue(claims.scope, SCOPE_PATTERN, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI", true),
    iat: normalizedEpochSeconds(claims.iat, "invalid_ai_capability"),
    exp: normalizedEpochSeconds(claims.exp, "invalid_ai_capability"),
    nonce: normalizedSafeValue(claims.nonce, NONCE_PATTERN, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI"),
  };
}

export function normalizeAiRiskClass(value: unknown): AiRiskClass {
  if (typeof value !== "string" || !AI_RISK_CLASS_SET.has(value)) {
    throw new SecurityError(400, "invalid_ai_risk_class", "Nieprawidłowa klasa ryzyka narzędzia AI");
  }
  return value as AiRiskClass;
}

export function aiRiskRequiresIdempotency(riskClass: AiRiskClass): boolean {
  return normalizeAiRiskClass(riskClass) !== "read_only";
}

/**
 * Druga, wdrożeniowa blokada produkcyjnej telefonii. Brak zmiennej albo każda
 * wartość inna niż dokładne `true` oznacza fail-closed. Sam klient, rekord
 * konfiguracji ani ogólny feature flag nie mogą zwolnić tej bramki.
 */
export function requireAiLiveRuntimeEnabled(value: unknown): void {
  if (value !== "true") {
    throw new SecurityError(503, "ai_live_runtime_disabled", "Produkcja agenta AI jest wyłączona");
  }
}

export function requireAiIdempotencyKey(
  value: string | null | undefined,
  riskClass: AiRiskClass,
): string | null {
  const risk = normalizeAiRiskClass(riskClass);
  if (!value) {
    if (risk === "read_only") return null;
    throw new SecurityError(400, "missing_ai_idempotency_key", "Operacja zapisu AI wymaga klucza idempotencji");
  }
  if (!isUuid(value)) {
    throw new SecurityError(400, "invalid_ai_idempotency_key", "Nieprawidłowy klucz idempotencji operacji AI");
  }
  return value.toLowerCase();
}

export function requireAiRequestIdempotencyKey(req: Request, riskClass: AiRiskClass): string | null {
  return requireAiIdempotencyKey(req.headers.get("x-idempotency-key"), riskClass);
}

/**
 * Żądanie uwierzytelnione JWT użytkownika zawsze pozostaje dry-run. Wyłączenie
 * dry-run dla wywołania wewnętrznego wymaga jednocześnie jawnego `false` w
 * kontrakcie operacji i niezależnego uprawnienia wynikającego ze zweryfikowanego
 * capability. Sama wartość z body nigdy nie wystarcza.
 */
export function resolveAiDryRun(options: {
  callerKind: AiCallerKind;
  requestedDryRun?: unknown;
  verifiedCapability?: VerifiedAiCapabilityClaims;
  requiredProductionScope?: string;
}): boolean {
  if (options.requestedDryRun !== undefined && typeof options.requestedDryRun !== "boolean") {
    throw new SecurityError(400, "invalid_ai_dry_run", "Nieprawidłowy tryb wykonania AI");
  }
  if (options.callerKind === "user_jwt") return true;
  if (options.callerKind !== "internal_capability") {
    throw new SecurityError(401, "invalid_ai_caller", "Nieprawidłowe uwierzytelnienie operacji AI");
  }
  if (options.requestedDryRun !== false) return true;
  const requiredScope = normalizedSafeValue(
    options.requiredProductionScope,
    SCOPE_PATTERN,
    "invalid_ai_scope",
    "Nieprawidłowy zakres capability AI",
    true,
  );
  const capability = options.verifiedCapability;
  const verified = capability?.[VERIFIED_CAPABILITY] === true && capability.scope === requiredScope;
  return !verified;
}

export async function issueAiCapabilityToken(
  secret: string | Uint8Array,
  input: IssueAiCapabilityInput,
): Promise<string> {
  const binding = normalizeCapabilityBinding(input);
  const now = input.nowSeconds === undefined
    ? Math.floor(Date.now() / 1000)
    : normalizedEpochSeconds(input.nowSeconds, "invalid_ai_capability_time");
  const ttl = input.ttlSeconds ?? 120;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_CAPABILITY_TTL_SECONDS) {
    throw new SecurityError(400, "invalid_ai_capability_ttl", "Nieprawidłowy czas ważności capability AI");
  }
  const nonce = input.nonce ?? crypto.randomUUID();
  const claims: AiCapabilityClaims = {
    v: 1,
    provider_id: binding.providerId,
    config_id: binding.configId,
    call_id: binding.callId,
    persona_key: binding.personaKey,
    scope: binding.scope,
    iat: now,
    exp: now + ttl,
    nonce: normalizedSafeValue(nonce, NONCE_PATTERN, "invalid_ai_capability_nonce", "Nieprawidłowy nonce capability AI"),
  };
  const payload = bytesToBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const signedData = `${CAPABILITY_PREFIX}.${payload}`;
  const signature = await signCapabilityData(secret, signedData);
  return `${signedData}.${signature}`;
}

export async function verifyAiCapabilityToken(
  token: string,
  secret: string | Uint8Array,
  options: VerifyAiCapabilityOptions,
): Promise<VerifiedAiCapabilityClaims> {
  if (typeof token !== "string" || token.length > 8192) {
    throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== CAPABILITY_PREFIX || parts[1].length > MAX_CAPABILITY_PAYLOAD_LENGTH || !/^[0-9a-f]{64}$/.test(parts[2])) {
    throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
  }
  const expectedSignature = await signCapabilityData(secret, `${parts[0]}.${parts[1]}`);
  if (!constantTimeEqual(parts[2], expectedSignature)) {
    throw new SecurityError(401, "invalid_ai_capability_signature", "Nieprawidłowe uwierzytelnienie capability AI");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(base64UrlToBytes(parts[1])));
  } catch (error) {
    if (error instanceof SecurityError) throw error;
    throw new SecurityError(401, "invalid_ai_capability", "Nieprawidłowe uwierzytelnienie capability AI");
  }
  const claims = normalizeCapabilityClaims(parsed);
  const binding = normalizeCapabilityBinding(options.binding);
  const now = options.nowSeconds === undefined
    ? Math.floor(Date.now() / 1000)
    : normalizedEpochSeconds(options.nowSeconds, "invalid_ai_capability_time");
  const maxClockSkew = options.maxClockSkewSeconds ?? 15;
  const maxTtl = options.maxTtlSeconds ?? MAX_CAPABILITY_TTL_SECONDS;
  if (!Number.isSafeInteger(maxClockSkew) || maxClockSkew < 0 || maxClockSkew > 60 ||
      !Number.isSafeInteger(maxTtl) || maxTtl < 1 || maxTtl > MAX_CAPABILITY_TTL_SECONDS) {
    throw new SecurityError(500, "invalid_ai_capability_policy", "Nieprawidłowa polityka capability AI");
  }
  if (claims.exp <= claims.iat || claims.exp - claims.iat > maxTtl || claims.iat > now + maxClockSkew) {
    throw new SecurityError(401, "invalid_ai_capability_time", "Nieprawidłowy czas capability AI");
  }
  if (claims.exp <= now) {
    throw new SecurityError(401, "expired_ai_capability", "Capability AI wygasło");
  }

  const matchesBinding = claims.provider_id === binding.providerId &&
    claims.config_id === binding.configId &&
    claims.call_id === binding.callId &&
    claims.persona_key === binding.personaKey &&
    claims.scope === binding.scope;
  if (!matchesBinding) {
    throw new SecurityError(403, "ai_capability_binding_denied", "Capability AI nie pasuje do operacji");
  }
  Object.defineProperty(claims, VERIFIED_CAPABILITY, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return Object.freeze(claims) as VerifiedAiCapabilityClaims;
}

/**
 * Korzysta z atomowego RPC `security_consume_rate_limit` utworzonego w Fazie C.
 * Subject musi pochodzić z JWT albo zweryfikowanego capability, nigdy z body.
 */
export async function consumeAiRateLimit(
  client: RateLimitRpcClient,
  options: AiRateLimitOptions,
): Promise<void> {
  const scope = normalizedSafeValue(options.scope, SCOPE_PATTERN, "invalid_ai_rate_scope", "Nieprawidłowy zakres limitu AI", true);
  if (!scope.startsWith("ai.")) {
    throw new SecurityError(400, "invalid_ai_rate_scope", "Zakres limitu AI musi należeć do przestrzeni ai.*");
  }
  const subjectId = normalizedUuid(options.subjectId, "invalid_ai_rate_subject", "Nieprawidłowy podmiot limitu AI");
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 10_000 ||
      !Number.isSafeInteger(options.windowSeconds) || options.windowSeconds < 1 || options.windowSeconds > 86_400) {
    throw new SecurityError(400, "invalid_ai_rate_policy", "Nieprawidłowa polityka limitu AI");
  }
  const { data, error } = await client.rpc("security_consume_rate_limit", {
    p_scope: scope,
    p_subject_id: subjectId,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) {
    throw new SecurityError(503, "ai_rate_limit_unavailable", "Nie można bezpiecznie sprawdzić limitu AI");
  }
  if (data !== true) {
    throw new SecurityError(429, "ai_rate_limit_exceeded", "Przekroczono limit operacji AI");
  }
}

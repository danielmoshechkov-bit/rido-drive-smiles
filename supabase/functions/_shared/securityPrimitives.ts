const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key|card|cvv|raw[_-]?body)/i;

// Klasa błędu nie zależy od klienta Supabase ani środowiska Deno. Dzięki temu
// walidatory wejścia można testować lokalnie bez ładowania zdalnych modułów.
export class SecurityError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function readBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

export function parseAllowedOrigins(raw: string | undefined, appUrl?: string): Set<string> {
  const origins = new Set<string>();
  for (const candidate of [raw ?? "", appUrl ?? ""].flatMap((value) => value.split(","))) {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "*") continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Nieprawidłowa wartość konfiguracyjna nie może rozszerzać allowlisty.
    }
  }
  return origins;
}

export function isOriginAllowed(origin: string | null, allowedOrigins: Set<string>): boolean {
  if (!origin) return true; // wywołania server-to-server zwykle nie mają Origin
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function safeCorrelationId(value: string | null): string | null {
  return value && isUuid(value) ? value : null;
}

export function redactAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 512 ? `${value.slice(0, 512)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactAuditMetadata(item, depth + 1));
  if (typeof value !== "object") return String(value);

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[REDACTED]"
      : redactAuditMetadata(item, depth + 1);
  }
  return result;
}

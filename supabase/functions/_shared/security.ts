import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import {
  constantTimeEqual,
  isOriginAllowed,
  isUuid,
  parseAllowedOrigins,
  readBearerToken,
  redactAuditMetadata,
  safeCorrelationId,
  SecurityError,
} from "./securityPrimitives.ts";

export { SecurityError } from "./securityPrimitives.ts";

type ServiceClient = ReturnType<typeof createClient>;

export interface RequestIdentity {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  roles: string[];
  fleetIds: string[];
  fleetRoles: Array<{ role: string; fleetId: string }>;
  companyIds: string[];
  ownedCompanyIds: string[];
  correlationId: string;
}

export interface AuditEvent {
  actorId?: string | null;
  tenantId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: "attempted" | "succeeded" | "denied" | "failed";
  correlationId: string;
  metadata?: Record<string, unknown>;
}

export interface RateLimitOptions {
  scope: string;
  subjectId: string;
  limit: number;
  windowSeconds: number;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new SecurityError(503, "security_not_configured", "Usługa nie jest bezpiecznie skonfigurowana");
  return value;
}

export function createServiceClient(): ServiceClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function allowedOrigins(): Set<string> {
  return parseAllowedOrigins(
    Deno.env.get("ALLOWED_ORIGINS"),
    Deno.env.get("APP_PUBLIC_URL") ?? Deno.env.get("SITE_URL"),
  );
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-idempotency-key, x-rido-ai-capability, x-rido-call-id, x-bootstrap-secret, x-local-test-secret",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && isOriginAllowed(origin, allowedOrigins())) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function handleCors(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  if (!isOriginAllowed(req.headers.get("Origin"), allowedOrigins())) {
    return jsonResponse(req, 403, { error: "origin_not_allowed" });
  }
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function jsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function errorResponse(req: Request, error: unknown): Response {
  if (error instanceof SecurityError) {
    return jsonResponse(req, error.status, { error: error.code, message: error.message });
  }
  console.error("security_endpoint_error", error instanceof Error ? error.name : "unknown_error");
  return jsonResponse(req, 500, { error: "internal_error", message: "Nie udało się wykonać operacji" });
}

export function requestCorrelationId(req: Request): string {
  return safeCorrelationId(req.headers.get("x-correlation-id")) ?? crypto.randomUUID();
}

export async function readJsonBody(
  req: Request,
  maxBytes: number,
  invalidMessage = "Nieprawidłowe dane żądania",
): Promise<any> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10_000_000) {
    throw new SecurityError(500, "invalid_body_limit", "Nieprawidłowa konfiguracja limitu żądania");
  }
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SecurityError(413, "payload_too_large", "Żądanie jest zbyt duże");
  }
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw new SecurityError(413, "payload_too_large", "Żądanie jest zbyt duże");
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new SecurityError(400, "invalid_json", invalidMessage);
  }
}

export async function requireUser(req: Request, client = createServiceClient()): Promise<RequestIdentity> {
  const token = readBearerToken(req.headers.get("Authorization"));
  if (!token) throw new SecurityError(401, "unauthorized", "Wymagane jest uwierzytelnienie");

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && constantTimeEqual(token, serviceRoleKey)) {
    throw new SecurityError(401, "invalid_user_token", "Wymagany jest token użytkownika");
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new SecurityError(401, "invalid_or_expired_token", "Sesja jest nieprawidłowa lub wygasła");

  const [
    { data: roleRows, error: rolesError },
    { data: membershipRows, error: membershipError },
    { data: ownedCompanyRows, error: ownedCompaniesError },
  ] = await Promise.all([
    client.from("user_roles").select("role, fleet_id").eq("user_id", data.user.id),
    client.from("company_members").select("company_id, status").eq("user_id", data.user.id).limit(1001),
    client.from("companies").select("id, status").eq("owner_user_id", data.user.id).eq("status", "active").limit(1001),
  ]);

  if (rolesError) throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić uprawnień");
  if (membershipError && membershipError.code !== "42P01") {
    throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić przynależności do firmy");
  }
  if (ownedCompaniesError && ownedCompaniesError.code !== "42P01") {
    throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić własności firmy");
  }
  if ((membershipRows?.length ?? 0) > 1000 || (ownedCompanyRows?.length ?? 0) > 1000) {
    throw new SecurityError(503, "authorization_context_too_large", "Nie można jednoznacznie potwierdzić uprawnień");
  }

  const roles = [...new Set((roleRows ?? []).map((row: { role: string }) => row.role))];
  const fleetIds = [...new Set((roleRows ?? [])
    .map((row: { fleet_id: string | null }) => row.fleet_id)
    .filter((value: string | null): value is string => isUuid(value)))];
  const fleetRoles = (roleRows ?? [])
    .filter((row: { fleet_id: string | null }) => isUuid(row.fleet_id))
    .map((row: { role: string; fleet_id: string }) => ({ role: row.role, fleetId: row.fleet_id }));
  const candidateMemberCompanyIds = [...new Set((membershipRows ?? [])
    .filter((row: { status?: string | null }) => row.status === "active")
    .map((row: { company_id: string | null }) => row.company_id)
    .filter((value: string | null): value is string => isUuid(value)))];

  let memberCompanyIds: string[] = [];
  if (candidateMemberCompanyIds.length > 0) {
    const { data: activeCompanies, error: activeCompaniesError } = await client
      .from("companies")
      .select("id")
      .in("id", candidateMemberCompanyIds)
      .eq("status", "active")
      .limit(1000);
    if (activeCompaniesError) {
      throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić statusu firmy");
    }
    memberCompanyIds = (activeCompanies ?? [])
      .map((row: { id: string | null }) => row.id)
      .filter((value: string | null): value is string => isUuid(value));
  }
  const ownedCompanyIds = [...new Set((ownedCompanyRows ?? [])
    .filter((row: { status?: string | null }) => row.status === "active")
    .map((row: { id: string | null }) => row.id)
    .filter((value: string | null): value is string => isUuid(value)))];
  const companyIds = [...new Set([...memberCompanyIds, ...ownedCompanyIds])];

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    isAdmin: roles.includes("admin"),
    roles,
    fleetIds,
    fleetRoles,
    companyIds,
    ownedCompanyIds,
    correlationId: requestCorrelationId(req),
  };
}

export async function requireAdmin(req: Request, client = createServiceClient()): Promise<RequestIdentity> {
  const identity = await requireUser(req, client);
  if (!identity.isAdmin) throw new SecurityError(403, "forbidden", "Wymagana jest rola administratora");
  return identity;
}

export async function consumeRateLimit(
  client: ServiceClient,
  options: RateLimitOptions,
): Promise<void> {
  if (!/^[a-z0-9][a-z0-9._:-]{2,79}$/.test(options.scope) || !isUuid(options.subjectId) ||
      !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 10_000 ||
      !Number.isSafeInteger(options.windowSeconds) || options.windowSeconds < 1 || options.windowSeconds > 86_400) {
    throw new SecurityError(500, "invalid_rate_limit_policy", "Nieprawidłowa polityka limitu żądań");
  }

  const { data, error } = await client.rpc("security_consume_rate_limit", {
    p_scope: options.scope,
    p_subject_id: options.subjectId,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) {
    throw new SecurityError(503, "rate_limit_unavailable", "Nie można bezpiecznie sprawdzić limitu żądań");
  }
  if (data !== true) {
    throw new SecurityError(429, "rate_limit_exceeded", "Przekroczono limit żądań");
  }
}

export function requireInternalSecret(
  req: Request,
  options: { envName: string; headerName?: string },
): void {
  const expected = Deno.env.get(options.envName);
  if (!expected || expected.length < 32) {
    throw new SecurityError(503, "security_not_configured", "Sekret integracji nie jest skonfigurowany");
  }
  const supplied = req.headers.get(options.headerName ?? "x-internal-secret") ?? "";
  if (!constantTimeEqual(supplied, expected)) {
    throw new SecurityError(401, "invalid_signature", "Nieprawidłowe uwierzytelnienie integracji");
  }
}

export async function assertCompanyAccess(identity: RequestIdentity, companyId: unknown): Promise<string> {
  if (!isUuid(companyId)) throw new SecurityError(400, "invalid_company", "Nieprawidłowy identyfikator firmy");
  if (!identity.isAdmin && !identity.companyIds.includes(companyId)) {
    throw new SecurityError(403, "cross_tenant_denied", "Brak dostępu do wskazanej firmy");
  }
  return companyId;
}

export async function resolveProviderForUser(
  client: ServiceClient,
  identity: RequestIdentity,
  requestedProviderId?: unknown,
): Promise<{ id: string; user_id: string; company_id: string | null }> {
  let query = client.from("service_providers").select("id, user_id, company_id");
  if (requestedProviderId !== undefined && requestedProviderId !== null && requestedProviderId !== "") {
    if (!isUuid(requestedProviderId)) throw new SecurityError(400, "invalid_provider", "Nieprawidłowy usługodawca");
    query = query.eq("id", requestedProviderId);
  } else {
    query = query.eq("user_id", identity.userId);
  }

  const { data, error } = await query.limit(2);
  if (error) throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić usługodawcy");
  if (!data?.length) throw new SecurityError(403, "provider_access_denied", "Brak dostępu do usługodawcy");
  if (!requestedProviderId && data.length !== 1) {
    throw new SecurityError(409, "provider_context_required", "Konto wymaga jednoznacznego kontekstu usługodawcy");
  }

  const provider = data[0] as { id: string; user_id: string; company_id: string | null };
  const ownsProvider = provider.user_id === identity.userId;
  const belongsToCompany = !!provider.company_id && identity.companyIds.includes(provider.company_id);
  if (!identity.isAdmin && !ownsProvider && !belongsToCompany) {
    throw new SecurityError(403, "cross_tenant_denied", "Brak dostępu do usługodawcy");
  }
  return provider;
}

export async function writeAuditEvent(client: ServiceClient, event: AuditEvent): Promise<void> {
  const { error } = await client.from("security_audit_log").insert({
    actor_id: event.actorId ?? null,
    tenant_id: event.tenantId ?? null,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId ?? null,
    result: event.result,
    correlation_id: event.correlationId,
    metadata: redactAuditMetadata(event.metadata ?? {}),
  });
  if (error) {
    console.error("security_audit_write_failed", { code: error.code, correlation_id: event.correlationId });
    throw new SecurityError(503, "audit_unavailable", "Nie można bezpiecznie zarejestrować operacji");
  }
}

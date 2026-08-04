import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { consumeAiRateLimit } from "../_shared/aiSecurity.ts";
import {
  SecurityError,
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  writeAuditEvent,
} from "../_shared/security.ts";

const MAX_QUERY_LENGTH = 10_000;
const ADMIN_AI_EXECUTE_HOURLY_LIMIT = 30;

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed" });
  }

  try {
    const admin = createServiceClient();
    const identity = await requireAdmin(req, admin);
    const body = await req.json().catch(() => {
      throw new SecurityError(400, "invalid_json", "Nieprawidłowe dane żądania");
    });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new SecurityError(400, "invalid_request", "Nieprawidłowe dane żądania");
    }

    const input = body as Record<string, unknown>;
    const query = typeof input.query === "string" ? input.query : "";
    if (!query || query.length > MAX_QUERY_LENGTH) {
      throw new SecurityError(400, "invalid_query", "Nieprawidłowa treść zapytania");
    }

    const upstreamBody = {
      feature: typeof input.feature === "string" ? input.feature.slice(0, 64) : "ai_help",
      taskType: "text",
      query,
      mode: "fast",
      stream: false,
    };
    const authorization = req.headers.get("Authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!authorization || !anonKey || !supabaseUrl) {
      throw new SecurityError(503, "security_not_configured", "Usługa nie jest bezpiecznie skonfigurowana");
    }

    await consumeAiRateLimit(admin, {
      scope: "ai.admin.execute.user.hourly",
      subjectId: identity.userId,
      limit: ADMIN_AI_EXECUTE_HOURLY_LIMIT,
      windowSeconds: 3_600,
    });

    await writeAuditEvent(admin, {
      actorId: identity.userId,
      action: "admin.ai.test_provider",
      resourceType: "ai_provider",
      result: "attempted",
      correlationId: identity.correlationId,
      metadata: { feature: upstreamBody.feature },
    });

    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
        apikey: anonKey,
        "x-correlation-id": identity.correlationId,
      },
      body: JSON.stringify(upstreamBody),
    });
    const data = await response.json().catch(() => ({ error: "upstream_error" }));

    await writeAuditEvent(admin, {
      actorId: identity.userId,
      action: "admin.ai.test_provider",
      resourceType: "ai_provider",
      result: response.ok ? "succeeded" : "failed",
      correlationId: identity.correlationId,
      metadata: { feature: upstreamBody.feature, upstream_status: response.status },
    });

    return jsonResponse(req, response.ok ? 200 : 502, data);
  } catch (error) {
    return errorResponse(req, error);
  }
});

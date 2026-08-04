import {
  createServiceClient,
  consumeRateLimit,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  writeAuditEvent,
} from "../_shared/security.ts";

const MAX_USERS = 500;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed" });
  }

  try {
    const adminClient = createServiceClient();
    const identity = await requireAdmin(req, adminClient);
    await consumeRateLimit(adminClient, {
      scope: "admin.user_directory.user.hourly",
      subjectId: identity.userId,
      limit: 30,
      windowSeconds: 3_600,
    });
    await consumeRateLimit(adminClient, {
      scope: "admin.user_directory.user.daily",
      subjectId: identity.userId,
      limit: 200,
      windowSeconds: 86_400,
    });

    const url = new URL(req.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? MAX_USERS);
    const perPage = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_USERS)
      : MAX_USERS;

    const { data: authData, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage,
    });
    if (listError) throw listError;

    const userIds = authData.users.map((user) => user.id);
    const { data: roles, error: rolesError } = userIds.length
      ? await adminClient
        .from("user_roles")
        .select("user_id, role, fleet_id")
        .in("user_id", userIds)
      : { data: [], error: null };
    if (rolesError) throw rolesError;

    const users = authData.users.map((user) => ({
      id: user.id,
      email: user.email ?? "",
      created_at: user.created_at,
      email_confirmed_at: user.email_confirmed_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      roles: (roles ?? []).filter((role) => role.user_id === user.id),
    }));

    await writeAuditEvent(adminClient, {
      actorId: identity.userId,
      action: "admin.users_listed",
      resourceType: "auth_user",
      result: "succeeded",
      correlationId: identity.correlationId,
      metadata: { returned_count: users.length, limit: perPage },
    });

    return jsonResponse(req, 200, { success: true, users, truncated: users.length === perPage });
  } catch (error) {
    return errorResponse(req, error);
  }
});

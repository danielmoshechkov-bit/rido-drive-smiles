import {
  createServiceClient,
  consumeRateLimit,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  readJsonBody,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";
import { isUuid } from "../_shared/securityPrimitives.ts";

interface CreateUserRequest {
  email?: unknown;
  password?: unknown;
  roles?: unknown;
  fleet_id?: unknown;
}

const ASSIGNABLE_ROLES = new Set([
  "fleet_settlement",
  "fleet_rental",
  "driver",
  "accounting_admin",
  "accountant",
  "real_estate_admin",
  "real_estate_agent",
  "marketplace_user",
  "service_provider",
  "sales_admin",
  "sales_rep",
  "marketing_manager",
]);
const FLEET_ROLES = new Set(["fleet_settlement", "fleet_rental", "driver"]);

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 128 &&
    /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });

  try {
    const adminClient = createServiceClient();
    const identity = await requireAdmin(req, adminClient);
    await consumeRateLimit(adminClient, {
      scope: "admin.user_create.user.hourly",
      subjectId: identity.userId,
      limit: 10,
      windowSeconds: 3_600,
    });
    await consumeRateLimit(adminClient, {
      scope: "admin.user_create.user.daily",
      subjectId: identity.userId,
      limit: 30,
      windowSeconds: 86_400,
    });
    const body = await readJsonBody(req, 8_192) as CreateUserRequest;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const roles = Array.isArray(body.roles)
      ? [...new Set(body.roles.filter((role): role is string => typeof role === "string"))]
      : [];
    const fleetId = body.fleet_id;

    if (!validEmail(email)) throw new SecurityError(400, "invalid_email", "Podaj prawidłowy adres e-mail");
    if (!validPassword(password)) {
      throw new SecurityError(
        400,
        "weak_password",
        "Hasło musi mieć 12–128 znaków oraz małą i wielką literę, cyfrę i znak specjalny",
      );
    }
    if (roles.length > 6 || roles.some((role) => !ASSIGNABLE_ROLES.has(role))) {
      if (roles.includes("admin")) {
        throw new SecurityError(403, "admin_grant_disabled", "Nadanie roli administratora wymaga osobnego procesu z reautoryzacją");
      }
      throw new SecurityError(400, "invalid_role", "Co najmniej jedna rola jest niedozwolona");
    }

    const requiresFleet = roles.some((role) => FLEET_ROLES.has(role));
    if (requiresFleet) {
      if (!isUuid(fleetId)) throw new SecurityError(400, "invalid_fleet", "Rola flotowa wymaga prawidłowej floty");
      const { data: fleet, error: fleetError } = await adminClient
        .from("fleets")
        .select("id")
        .eq("id", fleetId)
        .maybeSingle();
      if (fleetError || !fleet) throw new SecurityError(400, "invalid_fleet", "Wskazana flota nie istnieje");
    } else if (fleetId !== undefined && fleetId !== null && fleetId !== "" && !isUuid(fleetId)) {
      throw new SecurityError(400, "invalid_fleet", "Nieprawidłowy identyfikator floty");
    }

    await writeAuditEvent(adminClient, {
      actorId: identity.userId,
      action: "admin.user_create_attempted",
      resourceType: "auth_user",
      result: "attempted",
      correlationId: identity.correlationId,
      metadata: { roles, fleet_id: requiresFleet ? fleetId : null },
    });

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { created_by_admin: identity.userId, must_change_password: true },
    });
    if (createError || !newUser.user) {
      if (createError?.message.toLowerCase().includes("already")) {
        throw new SecurityError(409, "user_exists", "Użytkownik z tym adresem e-mail już istnieje");
      }
      throw createError ?? new Error("auth_user_create_failed");
    }

    if (roles.length > 0) {
      const roleRows = roles.map((role) => ({
        user_id: newUser.user!.id,
        role,
        fleet_id: FLEET_ROLES.has(role) ? fleetId : null,
      }));
      const { error: rolesError } = await adminClient.from("user_roles").insert(roleRows);
      if (rolesError) {
        const { error: rollbackError } = await adminClient.auth.admin.deleteUser(newUser.user.id);
        if (rollbackError) console.error("admin_create_user_compensation_failed", { code: rollbackError.code });
        throw rolesError;
      }
    }

    await writeAuditEvent(adminClient, {
      actorId: identity.userId,
      action: "admin.user_created",
      resourceType: "auth_user",
      resourceId: newUser.user.id,
      result: "succeeded",
      correlationId: identity.correlationId,
      metadata: { roles, fleet_id: requiresFleet ? fleetId : null, email_confirmed: false },
    });

    return jsonResponse(req, 201, {
      success: true,
      user: { id: newUser.user.id, email: newUser.user.email, email_confirmed: false },
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});

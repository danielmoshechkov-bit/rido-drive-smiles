import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireUser,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";
import { isUuid } from "../_shared/securityPrimitives.ts";

interface ResetRequest {
  action?: unknown;
  driver_id?: unknown;
  user_id?: unknown;
  email?: unknown;
  password?: unknown;
  confirmation?: unknown;
}

interface DriverTarget {
  id: string;
  email: string | null;
  fleet_id: string | null;
  city_id: string | null;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });

  try {
    const client = createServiceClient();
    const identity = await requireUser(req, client);
    const body = await req.json() as ResetRequest;
    const action = body.action === "delete" ? "delete" : "reset";

    let driverId: string | null = null;
    if (body.driver_id !== undefined && body.driver_id !== null && body.driver_id !== "") {
      if (!isUuid(body.driver_id)) throw new SecurityError(400, "invalid_driver", "Nieprawidłowy kierowca");
      driverId = body.driver_id;
    } else if (body.user_id !== undefined && body.user_id !== null && body.user_id !== "") {
      if (!isUuid(body.user_id)) throw new SecurityError(400, "invalid_user", "Nieprawidłowy użytkownik");
      const { data: mapping, error: mappingError } = await client
        .from("driver_app_users")
        .select("driver_id")
        .eq("user_id", body.user_id)
        .maybeSingle();
      if (mappingError) throw mappingError;
      driverId = mapping?.driver_id ?? null;
    }

    if (!driverId) {
      throw new SecurityError(
        400,
        "driver_context_required",
        "Wymagane jest jednoznaczne, istniejące powiązanie z kierowcą",
      );
    }

    const { data: driver, error: driverError } = await client
      .from("drivers")
      .select("id, email, fleet_id, city_id")
      .eq("id", driverId)
      .maybeSingle();
    if (driverError) throw driverError;
    if (!driver) throw new SecurityError(404, "driver_not_found", "Nie znaleziono kierowcy");
    const target = driver as DriverTarget;

    const canManageFleet = !!target.fleet_id && identity.fleetRoles.some((membership) =>
      membership.fleetId === target.fleet_id &&
      (membership.role === "fleet_settlement" || membership.role === "fleet_rental")
    );
    if (!identity.isAdmin && !canManageFleet) {
      throw new SecurityError(403, "cross_tenant_denied", "Brak dostępu do kierowcy");
    }

    const driverEmail = target.email?.trim().toLowerCase() ?? "";
    if (!driverEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(driverEmail)) {
      throw new SecurityError(409, "driver_email_invalid", "Kierowca nie ma prawidłowego adresu e-mail");
    }
    if (typeof body.email === "string" && body.email.trim().toLowerCase() !== driverEmail) {
      throw new SecurityError(400, "driver_identity_mismatch", "Adres e-mail nie odpowiada rekordowi kierowcy");
    }

    const { data: mapping, error: mappingError } = await client
      .from("driver_app_users")
      .select("user_id")
      .eq("driver_id", target.id)
      .maybeSingle();
    if (mappingError) throw mappingError;
    const mappedUserId = mapping?.user_id ?? null;
    if (isUuid(body.user_id) && mappedUserId !== body.user_id) {
      throw new SecurityError(403, "driver_identity_mismatch", "Użytkownik nie jest powiązany z kierowcą");
    }

    const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
    const expectedConfirmation = action === "delete"
      ? `DELETE_DRIVER_AUTH:${target.id}`
      : `RESET_DRIVER_PASSWORD:${target.id}`;
    if (confirmation !== expectedConfirmation) {
      throw new SecurityError(
        409,
        "explicit_confirmation_required",
        "Operacja wymaga ponownego, jawnego potwierdzenia w bezpiecznym interfejsie",
      );
    }

    await writeAuditEvent(client, {
      actorId: identity.userId,
      tenantId: target.fleet_id,
      action: action === "delete" ? "driver.auth_delete_attempted" : "driver.password_reset_attempted",
      resourceType: "driver",
      resourceId: target.id,
      result: "attempted",
      correlationId: identity.correlationId,
      metadata: { target_user_id: mappedUserId },
    });

    if (action === "delete") {
      await writeAuditEvent(client, {
        actorId: identity.userId,
        tenantId: target.fleet_id,
        action: "driver.auth_delete_blocked",
        resourceType: "driver",
        resourceId: target.id,
        result: "denied",
        correlationId: identity.correlationId,
        metadata: {
          target_user_id: mappedUserId,
          reason: "dedicated_unlink_and_account_deletion_workflow_required",
        },
      });
      throw new SecurityError(
        409,
        "verified_unlink_required",
        "Usuwanie całego konta Auth przez ekran kierowcy zostało wyłączone; wymagany jest osobny proces odłączenia roli.",
      );
    }

    await writeAuditEvent(client, {
      actorId: identity.userId,
      tenantId: target.fleet_id,
      action: "driver.password_reset_blocked",
      resourceType: "driver",
      resourceId: target.id,
      result: "denied",
      correlationId: identity.correlationId,
      metadata: {
        target_user_id: mappedUserId,
        reason: "verified_recovery_flow_required",
      },
    });
    throw new SecurityError(
      409,
      "verified_recovery_required",
      "Bezpośrednie ustawianie hasła zostało wyłączone. Użyj zweryfikowanego procesu recovery/invite.",
    );
  } catch (error) {
    return errorResponse(req, error);
  }
});

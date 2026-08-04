import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireInternalSecret,
  requestCorrelationId,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";

type Payload = {
  email?: unknown;
  password?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  city_id?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  let claimClient: ReturnType<typeof createServiceClient> | null = null;
  let claimCorrelationId: string | null = null;
  let bootstrapRoleCreated = false;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Dozwolona jest wyłącznie metoda POST");
    }

    // Bootstrap jest świadomie wyłączony w zwykłym środowisku wykonawczym.
    // Po pierwszym użyciu oba sekrety należy natychmiast usunąć z konfiguracji.
    if (Deno.env.get("ADMIN_BOOTSTRAP_ENABLED") !== "true") {
      throw new SecurityError(503, "bootstrap_disabled", "Inicjalizacja administratora jest wyłączona");
    }
    requireInternalSecret(req, {
      envName: "ADMIN_BOOTSTRAP_SECRET",
      headerName: "x-bootstrap-secret",
    });

    const correlationId = requestCorrelationId(req);
    const supabase = createServiceClient();

    const [roleAdmins, legacyAdmins] = await Promise.all([
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin"),
      supabase.from("drivers").select("id", { count: "exact", head: true }).eq("user_role", "admin"),
    ]);
    if (roleAdmins.error || legacyAdmins.error) {
      throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić stanu inicjalizacji");
    }
    if ((roleAdmins.count ?? 0) > 0 || (legacyAdmins.count ?? 0) > 0) {
      throw new SecurityError(409, "bootstrap_already_completed", "Administrator został już zainicjalizowany");
    }

    const body = await req.json().catch(() => null) as Payload | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const firstName = typeof body?.first_name === "string" ? body.first_name.trim().slice(0, 100) : "Admin";
    const lastName = typeof body?.last_name === "string" ? body.last_name.trim().slice(0, 100) : "GetRido";
    const cityId = typeof body?.city_id === "string" && UUID_PATTERN.test(body.city_id)
      ? body.city_id
      : null;

    const passwordIsStrong = password.length >= 12 && password.length <= 128 &&
      /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
    if (!EMAIL_PATTERN.test(email) || !passwordIsStrong) {
      throw new SecurityError(400, "invalid_bootstrap_payload", "Nieprawidłowy email lub hasło inicjalizacyjne");
    }

    const { error: claimError } = await supabase.from("security_bootstrap_claims").insert({
      bootstrap_key: "system_admin",
      correlation_id: correlationId,
    });
    if (claimError?.code === "23505") {
      throw new SecurityError(409, "bootstrap_already_claimed", "Inicjalizacja administratora została już rozpoczęta");
    }
    if (claimError) {
      throw new SecurityError(503, "bootstrap_claim_unavailable", "Nie można bezpiecznie rozpocząć inicjalizacji");
    }
    claimClient = supabase;
    claimCorrelationId = correlationId;

    await writeAuditEvent(supabase, {
      action: "admin.bootstrap",
      resourceType: "auth_user",
      result: "attempted",
      correlationId,
      metadata: { city_configured: !!cityId },
    });

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { first_name: firstName || "Admin", last_name: lastName || "GetRido" },
    });
    if (createError || !created.user) {
      throw new SecurityError(409, "bootstrap_user_creation_failed", "Nie udało się utworzyć konta administratora");
    }

    const userId = created.user.id;
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "admin",
      created_by: userId,
    });
    if (roleError) {
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new SecurityError(500, "bootstrap_role_creation_failed", "Nie udało się nadać roli administratora");
    }
    bootstrapRoleCreated = true;

    // Rekord kierowcy jest zachowywany wyłącznie dla kompatybilności starego panelu.
    // Brak city_id nie może blokować utworzenia właściwej roli w user_roles.
    if (cityId) {
      const { error: driverError } = await supabase.from("drivers").upsert({
        id: userId,
        city_id: cityId,
        first_name: firstName || "Admin",
        last_name: lastName || "GetRido",
        email,
        user_role: "admin",
      }, { onConflict: "id" });
      if (driverError) {
        console.error("admin_bootstrap_legacy_profile_failed", { correlation_id: correlationId, code: driverError.code });
      }
    }

    const { data: completedClaim, error: claimCompletionError } = await supabase
      .from("security_bootstrap_claims")
      .update({ completed_at: new Date().toISOString(), user_id: userId })
      .eq("bootstrap_key", "system_admin")
      .eq("correlation_id", correlationId)
      .select("bootstrap_key")
      .maybeSingle();
    if (claimCompletionError || !completedClaim) {
      throw new SecurityError(503, "bootstrap_claim_completion_failed", "Konto utworzono, ale nie można zamknąć inicjalizacji");
    }

    await writeAuditEvent(supabase, {
      actorId: userId,
      action: "admin.bootstrap",
      resourceType: "auth_user",
      resourceId: userId,
      result: "succeeded",
      correlationId,
    });

    return jsonResponse(req, 201, { success: true, user_id: userId, email_confirmation_required: true });
  } catch (error) {
    if (claimClient && claimCorrelationId && !bootstrapRoleCreated) {
      const { error: releaseError } = await claimClient.from("security_bootstrap_claims")
        .delete()
        .eq("bootstrap_key", "system_admin")
        .eq("correlation_id", claimCorrelationId);
      if (releaseError) {
        console.error("admin_bootstrap_claim_release_failed", { code: releaseError.code, correlation_id: claimCorrelationId });
      }
    }
    return errorResponse(req, error);
  }
});

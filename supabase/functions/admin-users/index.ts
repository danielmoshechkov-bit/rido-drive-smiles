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

async function requireMutation(result: { error: { code?: string } | null }, operation: string): Promise<void> {
  if (result.error) {
    console.error("admin_user_mutation_failed", { operation, code: result.error.code ?? "unknown" });
    throw new SecurityError(500, "user_operation_failed", "Nie udało się bezpiecznie wykonać operacji na koncie");
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Dozwolona jest wyłącznie metoda POST");
    }

    const supabase = createServiceClient();
    const identity = await requireAdmin(req, supabase);
    await consumeRateLimit(supabase, {
      scope: "admin.user_management.user.hourly",
      subjectId: identity.userId,
      limit: 120,
      windowSeconds: 3_600,
    });
    await consumeRateLimit(supabase, {
      scope: "admin.user_management.user.daily",
      subjectId: identity.userId,
      limit: 500,
      windowSeconds: 86_400,
    });
    const body = await readJsonBody(req, 8_192);
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "list") {
      const search = typeof body?.search === "string" ? body.search.trim().slice(0, 100) : "";
      const page = Math.max(1, Math.min(10_000, Number.parseInt(String(body?.page ?? "1"), 10) || 1));
      const perPage = Math.max(1, Math.min(100, Number.parseInt(String(body?.per_page ?? "50"), 10) || 50));
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listError) throw new SecurityError(503, "auth_directory_unavailable", "Nie można pobrać katalogu użytkowników");

      const userIds = authUsers.users.map((user) => user.id);
      const profiles = userIds.length > 0
        ? await supabase.from("marketplace_user_profiles")
          .select("user_id, first_name, last_name, phone, company_name")
          .in("user_id", userIds)
        : { data: [], error: null };
      if (profiles.error) throw new SecurityError(503, "profile_directory_unavailable", "Nie można pobrać profili użytkowników");
      const profileMap = new Map((profiles.data ?? []).map((profile) => [profile.user_id, profile]));

      let users = authUsers.users.map((user) => {
        const profile = profileMap.get(user.id);
        return {
          id: user.id,
          email: user.email ?? null,
          created_at: user.created_at,
          email_confirmed_at: user.email_confirmed_at,
          last_sign_in_at: user.last_sign_in_at,
          first_name: profile?.first_name ?? user.user_metadata?.first_name ?? null,
          last_name: profile?.last_name ?? user.user_metadata?.last_name ?? null,
          phone: profile?.phone ?? user.phone ?? null,
          company_name: profile?.company_name ?? null,
          has_profile: !!profile,
          account_type: user.user_metadata?.account_type ?? "unknown",
        };
      });
      if (search) {
        const normalized = search.toLocaleLowerCase("pl");
        users = users.filter((user) => [user.email, user.first_name, user.last_name, user.phone]
          .some((value) => String(value ?? "").toLocaleLowerCase("pl").includes(normalized)));
      }

      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.users.list",
        resourceType: "auth_user",
        result: "succeeded",
        correlationId: identity.correlationId,
        metadata: { page, per_page: perPage, returned: users.length, search_used: !!search },
      });
      return jsonResponse(req, 200, { users, total: users.length });
    }

    if (action === "delete") {
      const userId = body?.user_id;
      if (!isUuid(userId)) throw new SecurityError(400, "invalid_user", "Nieprawidłowy identyfikator użytkownika");
      if (userId === identity.userId) throw new SecurityError(409, "self_delete_denied", "Administrator nie może usunąć własnego konta");
      if (body?.confirmation !== `DELETE_USER:${userId}`) {
        throw new SecurityError(409, "confirmation_required", "Usunięcie konta wymaga jawnego potwierdzenia");
      }

      // Sama aktywna sesja administratora i tekstowe potwierdzenie nie są
      // wystarczającą reautoryzacją dla nieodwracalnego usunięcia konta.
      // Kod legacy pozostaje poniżej do wykorzystania dopiero w osobnym,
      // transakcyjnym workflow z MFA/reauth i polityką retencji danych.
      throw new SecurityError(
        409,
        "verified_account_deletion_required",
        "Usunięcie konta wymaga osobnego procesu z reautoryzacją",
      );

      const [{ data: target, error: targetError }, { data: targetRoles, error: rolesError }] = await Promise.all([
        supabase.auth.admin.getUserById(userId),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (targetError || !target.user) throw new SecurityError(404, "user_not_found", "Użytkownik nie istnieje");
      if (rolesError) throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić ról użytkownika");

      if ((targetRoles ?? []).some((row) => row.role === "admin")) {
        // Dwa równoległe żądania mogłyby przejść kontrolę "ostatniego admina"
        // i usunąć oba konta. Usuwanie administratora pozostaje zablokowane do
        // czasu transakcyjnego, reautoryzowanego workflow z blokadą w DB.
        throw new SecurityError(
          409,
          "admin_delete_disabled",
          "Usunięcie konta administratora wymaga osobnego procesu z reautoryzacją",
        );
      }

      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.users.delete",
        resourceType: "auth_user",
        resourceId: userId,
        result: "attempted",
        correlationId: identity.correlationId,
      });

      // Usunięcie konta nie może niejawnie kasować całej floty ani danych jej
      // kierowców. Zasoby tenantowe wymagają osobnego workflow likwidacji firmy.
      await requireMutation(await supabase.from("driver_app_users").delete().eq("user_id", userId), "driver_app_users");
      await requireMutation(await supabase.from("marketplace_user_profiles").delete().eq("user_id", userId), "marketplace_user_profiles");
      await requireMutation(await supabase.from("user_roles").delete().eq("user_id", userId), "user_roles");
      const deleteResult = await supabase.auth.admin.deleteUser(userId);
      if (deleteResult.error) throw new SecurityError(500, "auth_user_delete_failed", "Nie udało się usunąć konta użytkownika");

      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.users.delete",
        resourceType: "auth_user",
        resourceId: userId,
        result: "succeeded",
        correlationId: identity.correlationId,
      });
      return jsonResponse(req, 200, { success: true, message: "Użytkownik usunięty" });
    }

    if (action === "confirm-email") {
      const userId = body?.user_id;
      if (!isUuid(userId)) throw new SecurityError(400, "invalid_user", "Nieprawidłowy identyfikator użytkownika");
      if (body?.confirmation !== `CONFIRM_EMAIL:${userId}`) {
        throw new SecurityError(409, "confirmation_required", "Potwierdzenie emaila wymaga jawnego potwierdzenia administratora");
      }
      // Potwierdzenie adresu przez admin API omija dowód kontroli skrzynki.
      // Przywrócić wyłącznie przez natywny invite/recovery i audyt MFA.
      throw new SecurityError(
        409,
        "verified_email_confirmation_required",
        "Adres email musi zostać potwierdzony przez bezpieczny link użytkownika",
      );
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.users.confirm_email",
        resourceType: "auth_user",
        resourceId: userId,
        result: "attempted",
        correlationId: identity.correlationId,
      });
      const { error } = await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
      if (error) throw new SecurityError(500, "email_confirmation_failed", "Nie udało się potwierdzić emaila");
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.users.confirm_email",
        resourceType: "auth_user",
        resourceId: userId,
        result: "succeeded",
        correlationId: identity.correlationId,
      });
      return jsonResponse(req, 200, { success: true, message: "Email potwierdzony" });
    }

    if (action === "set-role") {
      const userId = body?.user_id;
      const role = typeof body?.role === "string" ? body.role : "";
      const enabled = body?.enabled;
      const fleetId = body?.fleet_id;
      if (!isUuid(userId) || !ASSIGNABLE_ROLES.has(role) || typeof enabled !== "boolean") {
        throw new SecurityError(400, "invalid_role_change", "Nieprawidłowa zmiana roli");
      }
      if (role === "admin") {
        throw new SecurityError(403, "admin_role_change_disabled", "Zmiana roli administratora wymaga reautoryzowanego procesu");
      }
      const needsFleet = FLEET_ROLES.has(role);
      if (enabled && needsFleet) {
        if (!isUuid(fleetId)) throw new SecurityError(400, "fleet_required", "Ta rola wymaga wskazania floty");
        const { data: fleet, error: fleetError } = await supabase.from("fleets")
          .select("id")
          .eq("id", fleetId)
          .maybeSingle();
        if (fleetError || !fleet) throw new SecurityError(400, "invalid_fleet", "Wskazana flota nie istnieje");
      }
      const { data: target, error: targetError } = await supabase.auth.admin.getUserById(userId);
      if (targetError || !target.user) throw new SecurityError(404, "user_not_found", "Użytkownik nie istnieje");

      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.user_role_change",
        resourceType: "auth_user",
        resourceId: userId,
        result: "attempted",
        correlationId: identity.correlationId,
        metadata: { role, enabled, fleet_id: enabled && needsFleet ? fleetId : null },
      });

      const mutation = enabled
        ? await supabase.from("user_roles").upsert({
          user_id: userId,
          role,
          fleet_id: needsFleet ? fleetId : null,
        }, { onConflict: "user_id,role" })
        : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      await requireMutation(mutation, "user_roles.set_role");

      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "admin.user_role_change",
        resourceType: "auth_user",
        resourceId: userId,
        result: "succeeded",
        correlationId: identity.correlationId,
        metadata: { role, enabled, fleet_id: enabled && needsFleet ? fleetId : null },
      });
      return jsonResponse(req, 200, { success: true });
    }

    throw new SecurityError(400, "unknown_action", "Nieznana akcja");
  } catch (error) {
    return errorResponse(req, error);
  }
});

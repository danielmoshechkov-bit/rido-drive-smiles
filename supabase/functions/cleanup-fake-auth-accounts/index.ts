import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";

const CONFIRMATION_PHRASE = "DELETE_RIDO_INTERNAL_AUTH_ACCOUNTS";
const MAX_PAGES = 100;
const USERS_PER_PAGE = 1_000;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Dozwolona jest wyłącznie metoda POST");
    }

    const supabase = createServiceClient();
    const identity = await requireAdmin(req, supabase);
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";

    const fakeCandidates: Array<{ id: string }> = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
      if (error) {
        throw new SecurityError(503, "auth_directory_unavailable", "Nie można pobrać katalogu kont");
      }
      const users = data.users ?? [];
      fakeCandidates.push(...users
        .filter((user) => user.email?.toLowerCase().endsWith("@rido.internal"))
        .map((user) => ({ id: user.id })));
      if (users.length < USERS_PER_PAGE) break;
      if (page === MAX_PAGES) {
        throw new SecurityError(413, "account_scan_limit_exceeded", "Liczba kont przekracza bezpieczny limit operacji");
      }
    }

    const { data: adminRows, error: adminRowsError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (adminRowsError) {
      throw new SecurityError(503, "authorization_unavailable", "Nie można potwierdzić kont chronionych");
    }
    const protectedIds = new Set([identity.userId, ...(adminRows ?? []).map((row) => row.user_id)]);
    const fakeUsers = fakeCandidates.filter((user) => !protectedIds.has(user.id));
    const protectedCount = fakeCandidates.length - fakeUsers.length;

    if (dryRun) {
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "auth_accounts.cleanup_preview",
        resourceType: "auth_user",
        result: "succeeded",
        correlationId: identity.correlationId,
        metadata: { matching_accounts: fakeUsers.length, protected_accounts: protectedCount },
      });
      return jsonResponse(req, 200, {
        success: true,
        dry_run: true,
        requires_confirmation: true,
        results: { total: fakeUsers.length, deleted: 0, protected: protectedCount, errors: [] },
      });
    }

    if (confirmation !== CONFIRMATION_PHRASE) {
      await writeAuditEvent(supabase, {
        actorId: identity.userId,
        action: "auth_accounts.cleanup",
        resourceType: "auth_user",
        result: "denied",
        correlationId: identity.correlationId,
        metadata: { matching_accounts: fakeUsers.length, protected_accounts: protectedCount, reason: "confirmation_required" },
      });
      throw new SecurityError(409, "confirmation_required", "Operacja wymaga jawnego potwierdzenia");
    }

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: "auth_accounts.cleanup",
      resourceType: "auth_user",
      result: "attempted",
      correlationId: identity.correlationId,
      metadata: { matching_accounts: fakeUsers.length, protected_accounts: protectedCount },
    });

    let deleted = 0;
    let failed = 0;
    for (const user of fakeUsers) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        failed += 1;
        console.error("cleanup_fake_auth_account_failed", {
          correlation_id: identity.correlationId,
          target_id: user.id,
          code: error.name,
        });
      } else {
        deleted += 1;
      }
    }

    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: "auth_accounts.cleanup",
      resourceType: "auth_user",
      result: failed === 0 ? "succeeded" : "failed",
      correlationId: identity.correlationId,
      metadata: { matching_accounts: fakeUsers.length, protected_accounts: protectedCount, deleted, failed },
    });

    if (failed > 0) {
      throw new SecurityError(500, "cleanup_incomplete", "Nie wszystkie konta zostały bezpiecznie usunięte");
    }

    return jsonResponse(req, 200, {
      success: true,
      dry_run: false,
      results: { total: fakeUsers.length, deleted, protected: protectedCount, errors: [] },
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});

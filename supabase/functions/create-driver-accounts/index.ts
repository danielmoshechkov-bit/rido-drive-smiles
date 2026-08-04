import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireAdmin,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Dozwolona jest wyłącznie metoda POST");
    }

    const supabase = createServiceClient();
    const identity = await requireAdmin(req, supabase);

    // Poprzednia wersja tworzyła wszystkie konta z jednym, znanym hasłem i
    // natychmiast potwierdzała email. Bezpieczny zamiennik musi używać
    // jednorazowych zaproszeń, limitu partii i jawnego monitoringu wysyłki.
    await writeAuditEvent(supabase, {
      actorId: identity.userId,
      action: "driver_accounts.bulk_create",
      resourceType: "auth_user",
      result: "denied",
      correlationId: identity.correlationId,
      metadata: { reason: "secure_invitation_workflow_required" },
    });

    return jsonResponse(req, 409, {
      success: false,
      error: "bulk_account_creation_disabled",
      message: "Masowe tworzenie kont jest wyłączone do czasu skonfigurowania bezpiecznych zaproszeń",
      results: { created: 0, already_exists: 0, errors: [] },
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});

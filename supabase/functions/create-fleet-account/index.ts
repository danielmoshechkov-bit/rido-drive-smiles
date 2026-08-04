import { handleCors, jsonResponse } from "../_shared/security.ts";

Deno.serve((req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed", message: "Dozwolona jest wyłącznie metoda POST" });
  }
  return jsonResponse(req, 409, {
    error: "secure_fleet_invitation_required",
    message: "Tworzenie konta floty jest wyłączone do czasu wdrożenia jednorazowych, audytowanych zaproszeń",
  });
});

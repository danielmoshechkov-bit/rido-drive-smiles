import { handleCors, jsonResponse } from "../_shared/security.ts";

Deno.serve((req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed", message: "Dozwolona jest wyłącznie metoda POST" });
  }
  return jsonResponse(req, 503, {
    error: "secure_password_recovery_required",
    message: "Wysyłka resetu hasła jest wyłączona; wymagany jest rate-limitowany proces Supabase Auth bez ujawniania istnienia konta",
  });
});

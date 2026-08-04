import { handleCors, jsonResponse } from "../_shared/security.ts";

Deno.serve((req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed", message: "Dozwolona jest wyłącznie metoda POST" });
  }
  return jsonResponse(req, 503, {
    error: "secure_activation_resend_required",
    message: "Ponowna wysyłka aktywacji jest wyłączona do czasu wdrożenia rate limitingu i bezpiecznego celu serwerowego",
  });
});

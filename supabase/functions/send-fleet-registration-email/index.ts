import { handleCors, jsonResponse } from "../_shared/security.ts";

Deno.serve((req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "method_not_allowed", message: "Dozwolona jest wyłącznie metoda POST" });
  }
  return jsonResponse(req, 503, {
    error: "trusted_fleet_registration_delivery_required",
    message: "Wysyłka aktywacji floty wymaga zaufanej kolejki i odbiorcy wyznaczonego po stronie serwera",
  });
});

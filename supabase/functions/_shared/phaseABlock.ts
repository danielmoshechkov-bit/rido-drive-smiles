import { handleCors, jsonResponse } from "./security.ts";

/**
 * Fail-closed guard for legacy endpoints that still use elevated credentials
 * without a complete caller, tenant, replay and idempotency boundary.
 *
 * The implementation below the guard is intentionally kept in place for a
 * reviewable restoration. Remove this guard only after replacing it with the
 * endpoint's required A/B/C/D authorization class and security tests.
 */
export function phaseABlockedResponse(req: Request, endpoint: string): Response {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  return jsonResponse(req, 503, {
    error: "security_configuration_required",
    message: "Funkcja jest czasowo niedostępna do czasu zakończenia konfiguracji bezpieczeństwa",
    endpoint,
  });
}
